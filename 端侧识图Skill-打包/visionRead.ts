// ════════════════════════════════════════════════════════════════════════════
// Skill · 端侧识图读字（visionRead）· 底层原语 · 可移植独立版（零项目依赖）
// ────────────────────────────────────────────────────────────────────────────
// 一句话：原图 → 端侧视觉模型读出文本 → 确定性正则脱敏 → 纯文本。
//
// 这是「原图只进端侧、绝不出端」这条隐私铁律的【唯一收口处】。凡是要"读图"的能力都走它：
// 原图只在这一个函数里碰一次端侧模型，读完即弃、不写持久层、不上云。脱敏正则也只维护这一份。
//
// 依赖倒置：本文件不绑定任何端侧框架，只依赖注入进来的 visionOnDevice（端侧视觉）。
// 把它换成任意实现（Qwen-VL on MNN / 浏览器 WebGPU / 本机推理服务）即可整体迁移。
//
// 分层（见同目录 visionExtract.ts）：
//   · 想要【纯文本】（再自行做领域专属/嵌套结构化）        → 直接用 visionRead。
//   · 想要【扁平结构化字段】（片名/导演/物种…）            → 用上层 visionExtract，它 = visionRead + 结构化。
// ════════════════════════════════════════════════════════════════════════════

/** 注入的端侧视觉能力（唯一接触原图的接口）。 */
export interface VisionReadDeps {
  /** 端侧视觉：原图 dataURL + 提示 → 读出的文本。原图只进这里、不出端。 */
  visionOnDevice: (imageDataUrl: string, prompt: string) => Promise<string>;
}

export interface VisionReadOptions {
  max?: number;       // 截断上限（默认 1200 字）
  redact?: boolean;   // 是否脱敏（默认 true，与端侧提示词里"别输出敏感号"互为双保险）
}

// 确定性脱敏（不靠模型自觉）：长卡号 → 证件(18,含X) → 手机(11)。顺序避免互吃字。
// 证件(18位,含尾X)在前 + 前后数字边界：否则 16-19 的卡号正则会先吃掉 18 位身份证、误标成卡号且漏掉尾 X。
const REDACT: [RegExp, string][] = [
  [/(?<!\d)\d{17}[\dXx](?!\d)/g, '***证件***'],
  [/(?<!\d)\d{16,19}(?!\d)/g, '***卡号***'],
  [/(?<!\d)1[3-9]\d{9}(?!\d)/g, '***手机***'],
];
export function redactText(s: string): string { let t = s || ''; for (const [re, rep] of REDACT) t = t.replace(re, rep); return t; }

/**
 * 原图 → 端侧视觉 → 脱敏文本。端侧未就绪 / 读不出 → 返回 ''（绝不把原图送云，由调用方走手填兜底）。
 * 【原图只进 deps.visionOnDevice 的唯一收口；原图用完即弃，不落任何持久层】。
 */
export async function visionRead(imageDataUrl: string, prompt: string, deps: VisionReadDeps, opts: VisionReadOptions = {}): Promise<string> {
  if (!imageDataUrl) return '';
  let raw = '';
  try { raw = (await deps.visionOnDevice(imageDataUrl, prompt)) || ''; } catch { raw = ''; }
  if (!raw) return '';
  const sliced = raw.slice(0, opts.max ?? 1200);
  return ((opts.redact ?? true) ? redactText(sliced) : sliced).trim();
}
