// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· 识图→结构化（vision extract）
// ────────────────────────────────────────────────────────────────────────────
// 一句话：给一张图 + 一份「目标字段 schema」，端侧把图读懂、整理成匹配 schema 的结构化 JSON。
//
// 为什么这是「端侧必须」的能力（端侧必要性论证 —— 这正是本 skill 想说明的事）：
//   · 隐私铁律：用户的截图/相册照片里常有票据、票根、身份证号、手机号、定位等敏感信息。
//     本 skill 的【① 视觉读图】这一步**只调端侧视觉模型（Qwen-VL，经 MNN / 浏览器 WebGPU）**，
//     原图一个字节都不出端、不上云。没有端侧 VL，就只能把原图传云——那会泄露隐私。所以这是「云替代不了」的。
//   · 离线 / 低延迟：图就在手机上，端侧直接读，不依赖网络往返、不耗流量传大图。
//   · 仅在【② 结构化】这一步，把端侧读出并【正则脱敏】后的纯文本，按需交给端侧文本模型或云 Qwen 整理成 JSON
//     （原图永不参与第②步）。这就是比赛要的「核心交互逻辑本地运行 + 云端协同」的标准形态。
//
// 泛化（解决「电影 schema≠书 schema」）：schema 不是写死的，而是【调用方传入的参数】（fields）。
//   电影传 {片名,导演,主演,年份}、书传 {书名,作者,译者}、自建 agent 直接传 manifest.tagFields。
//   同一个 skill、不同 schema → 自然适配任意领域。新增 agent 白得「拍图入库」能力、零改本 skill。
//
// 组合（书 §3.12：skill 可组合 skill，无层级）：本 skill 内部复用 [enrichEntity] 做第②步结构化。
//   调用方（各 curator 的 sense / 造物主引擎）复用本 skill。
//
// 解耦/可打包：核心（脱敏 + 提示词构造 + 两段编排 + 按 schema 取字段）自包含；对外只依赖两处清晰边界——
//   端侧视觉 `edgeSafe.vision(image, prompt)` 与 结构化 `enrichJSON`/端侧 `edgeSafe.chat`。
// ════════════════════════════════════════════════════════════════════════════
import { edgeSafe } from '../../../../frost-agent/edge/contract';
import { enrichJSON, extractJSON } from './enrichEntity';

/** 一个目标字段：key=JSON 键，label=给模型看的中文名，hint=可选补充说明。 */
export interface FieldSpec { key: string; label: string; hint?: string }

export interface VisionExtractInput {
  imageDataUrl: string;     // 原图（dataURL / objectURL）——只进端侧视觉，绝不出端
  domain: string;           // 领域上下文，如 '电影' / '书' / '咖啡馆' / '野生鸟类'
  fields: FieldSpec[];      // 目标 schema（调用方提供）
  redact?: boolean;         // 是否对端侧读出的文本做敏感号脱敏（默认 true，双保险）
}

export interface VisionExtractResult {
  fields: Record<string, string>;            // 按 fields.key 填好的结构化结果（图上没有的字段缺省不填）
  raw: string;                               // 端侧 VL 读出并脱敏后的原始文本（可调试 / 展示）
  ok: boolean;                               // 是否抽到 ≥1 个字段
  visionVia: 'edge' | 'none';                // 视觉永远端侧；'none' = 端侧 VL 未就绪/没读出
  structuredVia: 'edge' | 'cloud' | 'none';  // 结构化走端侧文本模型还是云 Qwen
  onDevice: boolean;                         // 是否全程端侧（视觉+结构化都端侧）
}

// 端侧脱敏（确定性机制，不靠模型自觉）：长卡号 → 证件(18,含X) → 手机(11)。顺序避免互吃字。
const REDACT: [RegExp, string][] = [
  [/\d{16,19}/g, '***卡号***'],
  [/\d{17}[\dXx]/g, '***证件***'],
  [/1[3-9]\d{9}/g, '***手机***'],
];
function redactText(s: string): string { let t = s || ''; for (const [re, rep] of REDACT) t = t.replace(re, rep); return t; }

// ① 视觉提示词：让端侧 VL 只读图上确有的字段、逐行输出，禁编造、禁输出敏感号。
function visionPrompt(domain: string, fields: FieldSpec[]): string {
  const lines = fields.map((f) => `· ${f.label}${f.hint ? `（${f.hint}）` : ''}`).join('\n');
  return [
    `这是一张关于「${domain}」的图片或截图。请只读出图中【实际可见】的信息，逐条输出，每条一行，格式「字段名：值」：`,
    lines,
    `规则：图上没有的字段就跳过，绝不编造；绝不输出身份证号、手机号、银行卡号、二维码内容——遇到一律写 ***。`,
  ].join('\n');
}

// ② 结构化提示词：把端侧读出的（脱敏）文本整理成固定键的 JSON。
function structurePrompt(domain: string, fields: FieldSpec[], raw: string): string {
  return [
    `下面是从一张「${domain}」图片里读出的文本。请整理成一个 JSON 对象，键固定用：${fields.map((f) => `"${f.key}"`).join('、')}。`,
    `每个键对应的中文含义：${fields.map((f) => `${f.key}=${f.label}`).join('；')}。`,
    `图上没有的字段给空字符串。只输出 JSON，不要解释、不要代码块。`,
    `文本：\n${raw}`,
  ].join('\n');
}

/**
 * 识图→结构化。原图只进端侧视觉（不出端）；脱敏文本再做结构化（端侧优先，回退云 Qwen）。
 * 端侧 VL 未就绪 → 诚实返回 visionVia:'none'（绝不把原图送云，宁可降级让用户手填）。
 */
export async function visionExtract(input: VisionExtractInput): Promise<VisionExtractResult> {
  const none: VisionExtractResult = { fields: {}, raw: '', ok: false, visionVia: 'none', structuredVia: 'none', onDevice: false };
  if (!input.imageDataUrl || !input.fields.length) return none;

  // ① 端侧视觉：原图只进端侧 VL，绝不出端。读不出/未就绪 → none（不把原图送云）。
  let raw = '';
  try { raw = (await edgeSafe.vision(input.imageDataUrl, visionPrompt(input.domain, input.fields))) || ''; } catch { raw = ''; }
  raw = ((input.redact ?? true) ? redactText(raw) : raw).slice(0, 1200).trim();
  if (!raw) return none;

  // ② 结构化：只把【脱敏文本】喂模型。端侧文本模型优先；不行再云 Qwen（原图全程不参与第②步）。
  const sp = structurePrompt(input.domain, input.fields, raw);
  let obj: Record<string, string> | null = null;
  let structuredVia: 'edge' | 'cloud' | 'none' = 'none';
  try {
    if (await edgeSafe.available()) {
      const t = await edgeSafe.chat(sp, { json: true });
      obj = extractJSON<Record<string, string>>(t);
      if (obj) structuredVia = 'edge';
    }
  } catch { /* 落到云 */ }
  if (!obj) { obj = await enrichJSON<Record<string, string>>({ prompt: sp }); if (obj) structuredVia = 'cloud'; }

  const fields: Record<string, string> = {};
  if (obj) for (const f of input.fields) { const v = obj[f.key]; if (typeof v === 'string' && v.trim()) fields[f.key] = v.trim(); }
  return { fields, raw, ok: Object.keys(fields).length > 0, visionVia: 'edge', structuredVia, onDevice: structuredVia === 'edge' };
}
