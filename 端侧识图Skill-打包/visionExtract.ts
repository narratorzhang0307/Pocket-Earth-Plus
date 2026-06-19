// ════════════════════════════════════════════════════════════════════════════
// Skill · 端侧识图 → 结构化（visionExtract）· 可移植独立版（零项目依赖）= visionRead + textExtract
// ────────────────────────────────────────────────────────────────────────────
// 给一张图 + 一份「目标字段 schema」，把图读懂、整理成匹配 schema 的结构化 JSON。
//
// 组合（图↔文对称）：
//   ① 端侧读字：visionRead（原图只进端侧 → 脱敏文本）——隐私边界收在那一处。
//   ② 结构化  ：textExtract（脱敏文本 → 扁平 JSON 字段）。原图不参与第②步。
//     visionRead   : 图  → 文字
//     textExtract  : 文字 → 字段
//     visionExtract: 图  → 字段
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
//   FieldSpec 的契约定义在 textExtract；这里再导出以兼容现有引用。
// ════════════════════════════════════════════════════════════════════════════
import { visionRead, type VisionReadDeps } from './visionRead';
import { textExtract, type TextExtractDeps, type FieldSpec } from './textExtract';

export type { FieldSpec };

/** 注入的能力接口：端侧视觉（visionRead）+ 结构化文本模型（textExtract）。 */
export interface VisionExtractDeps extends VisionReadDeps, TextExtractDeps {}

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

// ① 视觉提示词：让端侧 VL 只读图上确有的字段、逐行输出，禁编造、禁输出敏感号。
function visionPrompt(domain: string, fields: FieldSpec[]): string {
  const lines = fields.map((f) => `· ${f.label}${f.hint ? `（${f.hint}）` : ''}`).join('\n');
  return `这是一张关于「${domain}」的图片或截图。请只读出图中【实际可见】的信息，逐条输出，每条一行，格式「字段名：值」：\n${lines}\n规则：图上没有的字段就跳过，绝不编造；绝不输出身份证号、手机号、银行卡号、二维码内容——遇到一律写 ***。`;
}

/** 识图→结构化 = visionRead（图→脱敏文本，原图只进端侧）+ textExtract（文本→字段）。端侧视觉未就绪→visionVia:'none'（不送云）。 */
export async function visionExtract(input: VisionExtractInput, deps: VisionExtractDeps): Promise<VisionExtractResult> {
  const none: VisionExtractResult = { fields: {}, raw: '', ok: false, visionVia: 'none', structuredVia: 'none', onDevice: false };
  if (!input.imageDataUrl || !input.fields.length) return none;

  // ① 端侧读字：visionRead（原图只进端侧→脱敏，隐私收口）。读不出 → none（不把原图送云）。
  const raw = await visionRead(input.imageDataUrl, visionPrompt(input.domain, input.fields), deps, { max: 1200, redact: input.redact });
  if (!raw) return none;

  // ② 结构化：脱敏文本交 textExtract（原图全程不参与第②步）。
  const r = await textExtract({ text: raw, domain: input.domain, fields: input.fields }, deps);
  return { fields: r.fields, raw, ok: r.ok, visionVia: 'edge', structuredVia: r.via, onDevice: r.via !== 'cloud' };
}
