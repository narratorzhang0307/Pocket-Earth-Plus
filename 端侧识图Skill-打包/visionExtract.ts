// ════════════════════════════════════════════════════════════════════════════
// Skill · 端侧识图 → 结构化（visionExtract）· 可移植独立版（零项目依赖）
// ────────────────────────────────────────────────────────────────────────────
// 给一张图 + 一份「目标字段 schema」，把图读懂、整理成匹配 schema 的结构化 JSON。
//
// 本文件是【依赖倒置】的可移植版：它不 import 任何具体实现，只依赖两个注入进来的接口
//   · visionOnDevice —— 端侧视觉模型（如 Qwen-VL，经 MNN / 浏览器 WebGPU）
//   · structure      —— 把文本整理成 JSON 的文本模型（端侧 或 云）
// 把这两个接口换成任意实现，本 skill 即可整体迁移到任何项目、任何端侧推理框架。
//
// 为什么这一能力「必须端侧」（云替代不了）：
//   隐私 —— 用户截图常含票据 / 票根 / 证件号 / 手机号 / 定位。本 skill【第①步读图】只把原图交给
//           visionOnDevice（端侧模型），原图一个字节都不出端。没有端侧，就只能把原图传云 = 泄露隐私。
//   离线 / 低延迟 —— 图就在设备上，端侧直接读，不依赖网络往返、不耗流量传大图。
//   仅第②步把端侧读出并【正则脱敏】后的纯文本，交给 structure 整理成 JSON（原图全程不参与第②步）。
//   端侧未就绪时【诚实降级】：返回 visionVia:'none'，宁可让用户手填，也绝不把原图送云。
//
// 泛化（一套 skill 适配任意领域）：schema 是【调用方传入的参数】fields，不写死。
//   电影传 {片名,导演}、书传 {书名,作者}、自建 agent 传它自己声明的字段。同一 skill、不同 schema。
// ════════════════════════════════════════════════════════════════════════════

/** 一个目标字段：key=JSON 键，label=给模型看的名称，hint=可选补充。 */
export interface FieldSpec { key: string; label: string; hint?: string }

/** 注入的两个能力接口（依赖倒置：本 skill 只依赖接口，不依赖具体实现）。 */
export interface VisionExtractDeps {
  /** 端侧视觉：原图 + 提示 → 读出的文本。【唯一接触原图的地方，原图只进端侧】。 */
  visionOnDevice: (imageDataUrl: string, prompt: string) => Promise<string>;
  /** 结构化：提示 → JSON 字符串（端侧文本模型 或 云）。原图不参与，只喂脱敏文本。 */
  structure: (prompt: string) => Promise<string>;
  /** structure 是否运行在端侧（用于标记 onDevice；不传按云算）。 */
  structureOnDevice?: boolean;
}

export interface VisionExtractInput {
  imageDataUrl: string;     // 原图（dataURL）——只进 visionOnDevice，绝不出端
  domain: string;           // 领域上下文，如 '电影' / '书' / '咖啡馆'
  fields: FieldSpec[];      // 目标 schema（调用方提供）
  redact?: boolean;         // 是否对端侧读出的文本做敏感号脱敏（默认 true）
}

export interface VisionExtractResult {
  fields: Record<string, string>;            // 按 fields.key 填好的结构化结果
  raw: string;                               // 端侧读出并脱敏后的原始文本
  ok: boolean;                               // 是否抽到 ≥1 个字段
  visionVia: 'edge' | 'none';                // 视觉永远端侧；'none'=端侧未就绪/没读出
  structuredVia: 'edge' | 'cloud' | 'none';  // 结构化走端侧还是云
  onDevice: boolean;                         // 是否全程端侧
}

// 确定性脱敏（不靠模型自觉）：长卡号 → 证件(18,含X) → 手机(11)。顺序避免互吃字。
const REDACT: [RegExp, string][] = [
  [/\d{16,19}/g, '***卡号***'],
  [/\d{17}[\dXx]/g, '***证件***'],
  [/1[3-9]\d{9}/g, '***手机***'],
];
const redactText = (s: string): string => REDACT.reduce((t, [re, rep]) => t.replace(re, rep), s || '');

// 容错抽 JSON（容忍 ```json 包裹、前后废话）。
function extractJSON(text: string): Record<string, string> | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const m = body.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : body); } catch { return null; }
}

function visionPrompt(domain: string, fields: FieldSpec[]): string {
  const lines = fields.map((f) => `· ${f.label}${f.hint ? `（${f.hint}）` : ''}`).join('\n');
  return `这是一张关于「${domain}」的图片或截图。请只读出图中【实际可见】的信息，逐条输出，每条一行，格式「字段名：值」：\n${lines}\n规则：图上没有的字段就跳过，绝不编造；绝不输出身份证号、手机号、银行卡号、二维码内容——遇到一律写 ***。`;
}
function structurePrompt(domain: string, fields: FieldSpec[], raw: string): string {
  return `下面是从一张「${domain}」图片里读出的文本。请整理成一个 JSON 对象，键固定用：${fields.map((f) => `"${f.key}"`).join('、')}。\n键的含义：${fields.map((f) => `${f.key}=${f.label}`).join('；')}。\n图上没有的字段给空字符串。只输出 JSON，不要解释。\n文本：\n${raw}`;
}

/** 识图→结构化。原图只进端侧视觉；脱敏文本再结构化。端侧视觉未就绪→visionVia:'none'（不把原图送云）。 */
export async function visionExtract(input: VisionExtractInput, deps: VisionExtractDeps): Promise<VisionExtractResult> {
  const none: VisionExtractResult = { fields: {}, raw: '', ok: false, visionVia: 'none', structuredVia: 'none', onDevice: false };
  if (!input.imageDataUrl || !input.fields.length) return none;

  // ① 端侧视觉：原图只进端侧，绝不出端。读不出 → none（不把原图送云）。
  let raw = '';
  try { raw = (await deps.visionOnDevice(input.imageDataUrl, visionPrompt(input.domain, input.fields))) || ''; } catch { raw = ''; }
  raw = ((input.redact ?? true) ? redactText(raw) : raw).slice(0, 1200).trim();
  if (!raw) return none;

  // ② 结构化：只把脱敏文本喂模型（原图不参与）。
  let obj: Record<string, string> | null = null;
  let structuredVia: 'edge' | 'cloud' | 'none' = 'none';
  try {
    const t = await deps.structure(structurePrompt(input.domain, input.fields, raw));
    obj = extractJSON(t);
    if (obj) structuredVia = deps.structureOnDevice ? 'edge' : 'cloud';
  } catch { /* obj 仍为 null */ }

  // 单字段兜底：结构化没出、而 schema 只有一个字段时，端侧读出的（脱敏）文本本身就是答案——
  // 取首行冒号后的值，避免「白读一次端侧却丢结果」。全程没上云 → 仍算端侧完成。
  if (!obj && input.fields.length === 1) {
    const v = raw.split('\n')[0].replace(/^[^：:]*[：:]\s*/, '').trim();
    if (v) { obj = { [input.fields[0].key]: v }; structuredVia = 'none'; }
  }

  const fields: Record<string, string> = {};
  if (obj) for (const f of input.fields) { const v = obj[f.key]; if (typeof v === 'string' && v.trim()) fields[f.key] = v.trim(); }
  return { fields, raw, ok: Object.keys(fields).length > 0, visionVia: 'edge', structuredVia, onDevice: structuredVia !== 'cloud' };
}
