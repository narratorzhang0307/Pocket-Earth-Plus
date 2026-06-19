// ════════════════════════════════════════════════════════════════════════════
// 用法示例：三种 agent 怎么接入这套两层 skill（同一份 skill、各自传自己的接口与 schema）
// ────────────────────────────────────────────────────────────────────────────
// 运行前：把下面两个 stub 换成你的端侧模型调用即可。两个接口就是「端侧」的全部接触点。
// ════════════════════════════════════════════════════════════════════════════
import { visionExtract, type VisionExtractDeps } from './visionExtract';
import { visionRead, type VisionReadDeps } from './visionRead';

// —— 端侧能力（占位 stub，换成你的实现）————————————————————————————————
// 端侧视觉：接 Qwen-VL（MNN / 浏览器 WebGPU / 本机服务）。原图只进这里。
async function qwenVL(imageDataUrl: string, prompt: string): Promise<string> {
  void imageDataUrl; void prompt;
  return ''; // TODO: 调你的端侧 Qwen-VL，返回读出的文本；端侧未就绪就返回 ''（会被诚实降级）
}
// 结构化：接 Qwen 文本模型（端侧 Qwen3.5-0.8B/2B/4B 或云 qwen-plus）。只喂脱敏文本。
async function qwenText(prompt: string): Promise<string> {
  void prompt;
  return ''; // TODO: 调你的文本模型，返回 JSON 字符串
}

const visionDeps: VisionReadDeps = { visionOnDevice: qwenVL };
const extractDeps: VisionExtractDeps = { visionOnDevice: qwenVL, structure: qwenText, structureOnDevice: false };

// —— ① 电影 agent：单字段（片名）—— 用高层 visionExtract —————————————————————
export async function senseMovieTitle(imageDataUrl: string): Promise<string> {
  const r = await visionExtract({ imageDataUrl, domain: '电影', fields: [{ key: 'title', label: '片名', hint: '电影的中文名' }] }, extractDeps);
  return (r.fields.title || '').replace(/《|》/g, '').slice(0, 40).trim();
  // 端侧未就绪 → r.visionVia==='none'、返回 ''，调用方走手填兜底（原图始终没出端）。
}

// —— ② 旅行 agent：要纯文本，再自行做嵌套结构化（segments/stays/spots）—— 用底层 visionRead ——
export async function senseTripShot(imageDataUrl: string): Promise<string> {
  const prompt = '这是一张旅行票据/订单截图。逐条读出：出发城市、到达城市、日期、车次/航班号、酒店名、景点名。'
    + '每条一行。绝不输出身份证号/手机号/银行卡号/二维码——一律写 ***。读不清就跳过，不要编造。';
  return visionRead(imageDataUrl, prompt, visionDeps, { max: 1000 });
  // 拿到脱敏文本后，旅行 agent 用自己的 structureTrip(text) 整理成嵌套行程——
  // 因为行程是嵌套结构（一程含多段/多住/多景点），扁平的 visionExtract 套不进，故用底层原语。
}

// —— ③ 用户自建 agent：声明几个字段就白得「拍图入库」—— 用高层 visionExtract ——————————
export async function senseCustom(imageDataUrl: string, domain: string, fieldKeys: string[]): Promise<Record<string, string>> {
  const fields = fieldKeys.map((k) => ({ key: k, label: k }));
  const r = await visionExtract({ imageDataUrl, domain, fields }, extractDeps);
  return r.fields; // 如 domain='野生鸟类', fieldKeys=['物种','生境','观测地'] → {物种:'白鹭', 生境:'湿地', 观测地:'杭州'}
}
