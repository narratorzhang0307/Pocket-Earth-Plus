// ════════════════════════════════════════════════════════════════════════════
// Skill · 端侧识图 → 结构化（visionExtract）· 高层 · 可移植独立版（零项目依赖）
// ────────────────────────────────────────────────────────────────────────────
// 给一张图 + 一份「目标字段 schema」，把图读懂、整理成匹配 schema 的结构化 JSON。
//
// 分层（本 skill = 底层原语 visionRead + 结构化）：
//   ① 端侧读字：组合 visionRead（原图只进端侧 → 脱敏文本）——隐私边界收在那一处。
//   ② 结构化  ：把脱敏后的纯文本整理成扁平 JSON 字段（端侧文本模型优先、可回退云）。原图不参与第②步。
//
// 依赖倒置：本文件不 import 任何具体实现，只依赖注入进来的两个接口
//   · visionOnDevice —— 端侧视觉模型（如 Qwen-VL，经 MNN / 浏览器 WebGPU）【唯一接触原图处】
//   · structure      —— 把文本整理成 JSON 的文本模型（端侧 或 云）
// 把这两个接口换成任意实现，本 skill 即可整体迁移到任何项目、任何端侧推理框架。
//
// 为什么这一能力「必须端侧」（云替代不了）：
//   隐私 —— 用户截图常含票据/票根/证件号/手机号/定位。读图只交给 visionOnDevice（端侧），原图不出端。
//           没有端侧，就只能把原图传云 = 泄露隐私。端侧未就绪时【诚实降级】：visionVia:'none'，绝不送云。
//   离线/低延迟 —— 图就在设备上，端侧直接读，不依赖网络往返、不耗流量传大图。
//
// 泛化（一套 skill 适配任意领域）：schema 是【调用方传入的参数】fields，不写死。
//   电影传 {片名}、书传 {书名}、自建 agent 传它声明的字段。同一 skill、不同 schema。
// ════════════════════════════════════════════════════════════════════════════
import { visionRead, type VisionReadDeps } from './visionRead';

/** 一个目标字段：key=JSON 键，label=给模型看的名称，hint=可选补充。 */
export interface FieldSpec { key: string; label: string; hint?: string }

/** 注入的能力接口：继承 visionRead 的端侧视觉，再加一个结构化文本模型。 */
export interface VisionExtractDeps extends VisionReadDeps {
  /** 结构化：提示 → JSON 字符串（端侧文本模型 或 云）。原图不参与，只喂脱敏文本。 */
  structure: (prompt: string) => Promise<string>;
  /** structure 是否运行在端侧（用于标记 onDevice；不传按云算）。 */
  structureOnDevice?: boolean;
}

export interface VisionExtractInput {
  imageDataUrl: string;     // 原图（dataURL）——只进端侧视觉，绝不出端
  domain: string;           // 领域上下文，如 '电影' / '书' / '咖啡馆'
  fields: FieldSpec[];      // 目标 schema（调用方提供）
  redact?: boolean;         // 是否对端侧读出的文本做敏感号脱敏（默认 true）
}

export interface VisionExtractResult {
  fields: Record<string, string>;            // 按 fields.key 填好的结构化结果
  raw: string;                               // 端侧读出并脱敏后的原始文本
  ok: boolean;                               // 是否抽到 ≥1 个字段
  visionVia: 'edge' | 'none';                // 视觉永远端侧；'none'=端侧未就绪/没读出
  structuredVia: 'edge' | 'cloud' | 'none';  // 结构化走端侧、走云，还是没走（单字段兜底=none）
  onDevice: boolean;                         // 是否全程未上云（端侧结构化 或 单字段兜底）
}

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

/** 识图→结构化。原图只进端侧视觉（经 visionRead）；脱敏文本再结构化。端侧视觉未就绪→visionVia:'none'（不送云）。 */
export async function visionExtract(input: VisionExtractInput, deps: VisionExtractDeps): Promise<VisionExtractResult> {
  const none: VisionExtractResult = { fields: {}, raw: '', ok: false, visionVia: 'none', structuredVia: 'none', onDevice: false };
  if (!input.imageDataUrl || !input.fields.length) return none;

  // ① 端侧读字：调底层原语 visionRead（原图只进端侧→脱敏，隐私收口）。读不出 → none（不把原图送云）。
  const raw = await visionRead(input.imageDataUrl, visionPrompt(input.domain, input.fields), deps, { max: 1200, redact: input.redact });
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
