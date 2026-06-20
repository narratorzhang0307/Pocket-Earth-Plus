// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· structured —— schema 驱动「提示生成 + 运行时校验」（借鉴 langchain output-parsers）
// ────────────────────────────────────────────────────────────────────────────
// langchain 把「让 LLM 吐结构化数据」拆成四个正交关注点。这里借两个最高性价比的，用最朴素的 schema 实现：
//   · formatInstructions(schema) —— schema【确定性派生】成提示词约束，收敛各 curator 手写的「请返回 JSON…」。
//   · validateShape<T>(obj, schema) —— 补 enrichJSON<T> 的【运行时空洞】：T 只是编译期标注，运行时不校验形状；
//     这里真按 schema 校验类型，不符返回 null 走舱壁（契合优雅降级）。
// 不引 zod 全家桶、不搬 langchain 的 parser 类层级——对手搓 harness 是过度工程。
// ════════════════════════════════════════════════════════════════════════════

export interface FieldShape { type: 'string' | 'number' | 'string[]' | 'boolean'; desc?: string; required?: boolean }
export type Shape = Record<string, FieldShape>;

/** schema → 提示词约束（确定性派生 + langchain 那段「别加围栏/别加废话」戒律的精简中文版）。 */
export function formatInstructions(s: Shape): string {
  const fields = Object.entries(s)
    .map(([k, v]) => `  "${k}": ${v.type}${v.required ? '（必填）' : ''}${v.desc ? `  // ${v.desc}` : ''}`)
    .join('\n');
  return `只返回一个 JSON 对象，不要 markdown 围栏、不要任何前后说明文字。字段：\n{\n${fields}\n}`;
}

/** 运行时按 schema 校验对象形状。不符（缺必填 / 类型错 / 非对象 / 是数组）→ null（调用方走兜底，舱壁）。 */
export function validateShape<T = Record<string, unknown>>(obj: unknown, s: Shape): T | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(s)) {
    const val = o[k];
    if (val == null) { if (v.required) return null; continue; }   // 缺非必填 → 跳过；缺必填 → 不合格
    const ok =
      v.type === 'string' ? typeof val === 'string' :
      v.type === 'number' ? typeof val === 'number' && Number.isFinite(val) :
      v.type === 'boolean' ? typeof val === 'boolean' :
      v.type === 'string[]' ? Array.isArray(val) && val.every((x) => typeof x === 'string') :
      false;
    if (!ok) return null;
  }
  return o as T;
}
