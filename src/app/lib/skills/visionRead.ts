// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· 底层原语 · 端侧识图读字（vision read）
// ────────────────────────────────────────────────────────────────────────────
// 一句话：原图 → 端侧视觉模型读出文本 → 确定性正则脱敏 → 纯文本。
//
// 这是「原图只进端侧、绝不出端」这条隐私铁律的【唯一收口处】：全项目凡是要"读图"的 agent
// （电影/书认片、旅行票据 OCR、自建 agent 拍图…）都走这一个函数，原图只在这里碰一次端侧模型，
// 一个字节都不写持久层、不上云。脱敏正则也只在这里维护一份（曾在 movie/travel/visionExtract 各有一份）。
//
// 分层（书 §3.12 skill 组合 skill）：
//   · 想要【纯文本】（再自行做领域专属/嵌套结构化，如旅行的 segments/stays/spots）→ 直接用 visionRead。
//   · 想要【扁平结构化字段】（片名/导演/物种…）→ 用上层 [visionExtract]，它 = visionRead + 结构化。
// ════════════════════════════════════════════════════════════════════════════
import { edgeSafe } from '../../../../frost-agent/edge/contract';

// 确定性脱敏（不靠模型自觉）：长卡号 → 证件(18,含X) → 手机(11)。顺序避免互吃字。
const REDACT: [RegExp, string][] = [
  [/\d{16,19}/g, '***卡号***'],
  [/\d{17}[\dXx]/g, '***证件***'],
  [/1[3-9]\d{9}/g, '***手机***'],
];
export function redactText(s: string): string { let t = s || ''; for (const [re, rep] of REDACT) t = t.replace(re, rep); return t; }

export interface VisionReadOptions {
  max?: number;       // 截断上限（默认 1200 字）
  redact?: boolean;   // 是否脱敏（默认 true，与端侧提示词里"别输出敏感号"互为双保险）
}

/**
 * 原图 → 端侧视觉 → 脱敏文本。端侧未就绪 / 读不出 → 返回 ''（绝不把原图送云，由调用方走手填兜底）。
 * 【原图只进端侧 edgeSafe.vision 的唯一收口；原图用完即弃，不落任何持久层】。
 */
export async function visionRead(imageDataUrl: string, prompt: string, opts: VisionReadOptions = {}): Promise<string> {
  if (!imageDataUrl) return '';
  let raw = '';
  try { raw = (await edgeSafe.vision(imageDataUrl, prompt)) || ''; } catch { raw = ''; }
  if (!raw) return '';
  const sliced = raw.slice(0, opts.max ?? 1200);
  return ((opts.redact ?? true) ? redactText(sliced) : sliced).trim();
}
