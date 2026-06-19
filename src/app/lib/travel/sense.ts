// 感知层（A 线截图提炼）：端侧 vision 读票据 → 原始文本；端侧正则脱敏（身份证/手机/卡号绝不出端侧）。
// 与 movie/sense.ts 同纪律：原图只进端侧 vision（浏览器 WebGPU / 端侧服务），不出手机；
// 线上 edge=stub 时 vision 返回 '' → 上层走「手动录入」兜底（诚实降级，不假装）。
import { edgeSafe } from '../../../../frost-agent/edge/contract';
import type { RawShot } from './types';

// 端侧脱敏（确定性机制，不靠模型自觉）：先长卡号 → 身份证(18,含X) → 手机(11)。顺序避免互相吃字。
const REDACT: [RegExp, string][] = [
  [/\d{16,19}/g, '***卡号***'],
  [/\d{17}[\dXx]/g, '***证件***'],
  [/1[3-9]\d{9}/g, '***手机***'],
];
export function redact(text: string): string {
  let t = text || '';
  for (const [re, rep] of REDACT) t = t.replace(re, rep);
  return t;
}

const VISION_PROMPT = '这是一张旅行票据/订单截图（火车票/机票/酒店确认/景点门票之一）。'
  + '逐条读出其中的关键信息：出发城市、到达城市、日期、车次或航班号、出发/到达时间、酒店名、入住/退房日期、景点名称。每条一行。'
  + '绝对不要输出身份证号、手机号、银行卡号、二维码内容——遇到这些一律用 *** 代替。不要编造任何图上没有的内容；读不清就跳过。';

// 端侧 vision 读一张票据 → 脱敏文本。端侧未就绪（线上 stub）/读不出返回 ''。
export async function ocrShot(imageDataUrl: string): Promise<string> {
  try {
    const raw = await edgeSafe.vision(imageDataUrl, VISION_PROMPT);
    return redact((raw || '').slice(0, 1000)).trim();   // 端侧已被要求不输出敏感号，再正则兜底脱敏（双保险）
  } catch { return ''; }
}

// 批量：逐张读，进度回调。原图（dataURL）用完即弃——绝不写入任何持久层。
export async function ocrShots(imageDataUrls: string[], onShot?: (done: number, total: number) => void): Promise<RawShot[]> {
  const out: RawShot[] = [];
  for (let i = 0; i < imageDataUrls.length; i++) {
    onShot?.(i + 1, imageDataUrls.length);
    const text = await ocrShot(imageDataUrls[i]);
    if (text) out.push({ id: `shot${i}`, text });
  }
  return out;
}
