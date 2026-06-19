// 感知层：把三种输入归一成「候选片名 + 可选用户评分」。
// 截图认片解耦进 [visionExtract] skill（原图只进端侧 VL→脱敏→结构化）；一句话用确定性正则抽取，不耗云端。
import { visionExtract } from '../skills/visionExtract';

const CN_NUM: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

// 从一句话抽用户评分（→ 0-5 星）：「五星/5星/★★★★」直接星；「8分」按 10 制折半。判不出返回 undefined。
export function parseRating(text: string): number | undefined {
  const stars = (text.match(/★/g) || []).length;
  if (stars) return Math.min(5, stars);
  let m = text.match(/([0-9一二两三四五])\s*星(半)?/);
  if (m) { const n = /[0-9]/.test(m[1]) ? +m[1] : CN_NUM[m[1]]; return Math.max(0, Math.min(5, n + (m[2] ? 1 : 0))); }   // 三星半 → 4
  m = text.match(/([0-9]+(?:\.[0-9])?)\s*分/);
  if (m) { const v = parseFloat(m[1]); return Math.max(0, Math.min(5, Math.round((v > 5 ? v / 2 : v)))); }
  if (/满分|神作|封神/.test(text)) return 5;
  return undefined;
}

// 从一句话抽片名：《》优先；否则去掉「看了/标记/帮我/记一下/这部电影」等噪声词与评分尾巴。
export function parseTitle(text: string): string {
  const t = (text || '').trim();
  const quoted = t.match(/《([^》]+)》/);
  if (quoted) return quoted[1].trim();
  let s = t
    .replace(/[0-9一二两三四五]\s*星半?|[0-9]+(?:\.[0-9])?\s*分|★+/g, ' ')           // 去评分
    .replace(/(帮我|给我|请|麻烦)?(标记|记录|记一下|记一笔|收藏|添加|标一下|标下)一?下?/g, ' ')
    .replace(/我?(刚|今天|昨天|周末|最近)?(看完了?|看了|刷了|重温了?|二刷了?|追完了?)/g, ' ')
    .replace(/这[部张]?(电影|片子?|纪录片)?|的?这部|想看|推荐/g, ' ')
    .replace(/[，,。.！!？?；;~、]+/g, ' ')
    .trim();
  // 去噪后保留整段（含词间空格）当片名——不再取「最长空格段」，否则含空格的多词片名会被截断
  //（海王2 失落的王国→失落的王国、12 Angry Men→Angry）。matchInCatalog 会再归一化去空格匹配。
  return s.replace(/\s+/g, ' ').trim();
}

// 截图认片：解耦进 [visionExtract]（原图只进端侧 Qwen-VL→脱敏→按 schema 结构化）。端侧未就绪→''（手填兜底）。
export async function ocrTitle(imageDataUrl: string): Promise<string> {
  const r = await visionExtract({ imageDataUrl, domain: '电影', fields: [{ key: 'title', label: '片名', hint: '电影的中文名' }] });
  return (r.fields.title || '').replace(/《|》/g, '').slice(0, 40).trim();
}

// 统一感知入口：返回候选片名与（可选）评分
export interface Sensed { title: string; rating?: number; from: 'quote' | 'ocr' | 'manual' }
export async function sense(input: { kind: 'text' | 'image' | 'manual'; text?: string; imageDataUrl?: string; manualTitle?: string; manualRating?: number }): Promise<Sensed> {
  if (input.kind === 'image' && input.imageDataUrl) {
    return { title: await ocrTitle(input.imageDataUrl), from: 'ocr' };
  }
  if (input.kind === 'manual') {
    return { title: (input.manualTitle || '').trim(), rating: input.manualRating, from: 'manual' };
  }
  const text = input.text || '';
  return { title: parseTitle(text), rating: parseRating(text), from: 'quote' };
}
