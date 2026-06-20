// ════════════════════════════════════════════════════════════════════════════
// Skill · 文本 → 结构化字段（textExtract）· 可移植独立版（零项目依赖）
// ────────────────────────────────────────────────────────────────────────────
// 给一段文本 + 一份「目标字段 schema」，整理成匹配 schema 的扁平 JSON 字段。
//
// 它和 visionExtract 完全对称，组合关系清晰：
//   visionRead   : 图  → 文字        （端侧·脱敏）
//   textExtract  : 文字 → 字段        （本 skill）
//   visionExtract: 图  → 字段  =  visionRead + textExtract
// 也可单独用于「直接丢一段文本、按声明字段结构化」的场景（不经图片）。
//
// 依赖倒置：只依赖注入进来的 structure（把文本整理成 JSON 的文本模型；端侧 或 云）。
// 泛化：schema 是【调用方传入的参数】fields，不写死。FieldSpec 的契约在此定义。
// ════════════════════════════════════════════════════════════════════════════

/** 一个目标字段：key=JSON 键，label=给模型看的名称，hint=可选补充。 */
export interface FieldSpec { key: string; label: string; hint?: string }

/** 注入的结构化能力。 */
export interface TextExtractDeps {
  /** 把提示整理成 JSON 字符串（端侧文本模型 或 云）。 */
  structure: (prompt: string) => Promise<string>;
  /** structure 是否运行在端侧（用于标记 via；不传按云算）。 */
  structureOnDevice?: boolean;
}

export interface TextExtractInput {
  text: string;             // 待结构化的文本（若来自图片，应先经 visionRead 脱敏）
  domain: string;           // 领域上下文，如 '电影' / '咖啡馆'
  fields: FieldSpec[];      // 目标 schema（调用方提供）
  instruction?: string;     // 可选：额外领域指引（如落点优先级、口吻），原样并入提示词
}

export interface TextExtractResult {
  fields: Record<string, string>;     // 按 fields.key 填好的结构化结果
  ok: boolean;                        // 是否抽到 ≥1 个字段
  via: 'edge' | 'cloud' | 'none';     // 结构化走端侧、走云，还是没走（单字段兜底=none）
}

// 容错抽 JSON：对象优先→数组→整段，取第一个能解析的（避免 prose 杂散 [ 撑大贪婪匹配）。
function extractJSON(text: string): Record<string, string> | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const tryParse = (s: string | null): Record<string, string> | null => { if (!s) return null; try { return JSON.parse(s); } catch { return null; } };
  const obj = body.indexOf('{') !== -1 ? body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1) : null;
  const arr = body.indexOf('[') !== -1 ? body.slice(body.indexOf('['), body.lastIndexOf(']') + 1) : null;
  return tryParse(obj) ?? tryParse(arr) ?? tryParse(body.trim());
}

function structurePrompt(domain: string, fields: FieldSpec[], raw: string, instruction?: string): string {
  return [
    `下面是关于「${domain}」的文本。请整理成一个 JSON 对象，键固定用：${fields.map((f) => `"${f.key}"`).join('、')}。`,
    `每个键的含义：${fields.map((f) => `${f.key}=${f.label}${f.hint ? `（${f.hint}）` : ''}`).join('；')}。`,
    instruction || '',
    `文本里没有的字段给空字符串。只输出 JSON，不要解释。`,
    `文本：\n${raw}`,
  ].filter(Boolean).join('\n');
}

/**
 * 文本→结构化字段。via 标记走端侧还是云。
 * 单字段兜底：结构化没出、而 schema 只有一个字段时，文本首行（冒号后）即答案——避免白丢结果。
 */
export async function textExtract(input: TextExtractInput, deps: TextExtractDeps): Promise<TextExtractResult> {
  const none: TextExtractResult = { fields: {}, ok: false, via: 'none' };
  const text = (input.text || '').trim();
  if (!text || !input.fields.length) return none;

  let obj: Record<string, string> | null = null;
  let via: 'edge' | 'cloud' | 'none' = 'none';
  try {
    const t = await deps.structure(structurePrompt(input.domain, input.fields, text, input.instruction));
    obj = extractJSON(t);
    if (obj) via = deps.structureOnDevice ? 'edge' : 'cloud';
  } catch { /* obj 仍为 null */ }
  if (obj && Array.isArray(obj)) { obj = null; via = 'none'; }   // 模型误吐数组 → 当未结构化，落单字段兜底

  // 单字段兜底
  if (!obj && input.fields.length === 1) {
    const v = text.split('\n')[0].replace(/^[^：:]*[：:]\s*/, '').trim();
    if (v) { obj = { [input.fields[0].key]: v }; via = 'none'; }
  }

  const fields: Record<string, string> = {};
  if (obj) for (const f of input.fields) { const v = obj[f.key]; if (typeof v === 'string' && v.trim()) fields[f.key] = v.trim(); }
  return { fields, ok: Object.keys(fields).length > 0, via };
}
