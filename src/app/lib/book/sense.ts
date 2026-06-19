// 感知层：三种输入归一成「候选书名 + 可选评分」。书封截图只走端侧 vision（原图不出端）。
import { edgeSafe } from '../../../../frost-agent/edge/contract';

const CN_NUM: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5 };

export function parseRating(text: string): number | undefined {
  const stars = (text.match(/★/g) || []).length;
  if (stars) return Math.min(5, stars);
  let m = text.match(/([0-9一二两三四五])\s*星(半)?/);
  if (m) { const n = /[0-9]/.test(m[1]) ? +m[1] : CN_NUM[m[1]]; return Math.max(0, Math.min(5, n + (m[2] ? 1 : 0))); }   // 三星半 → 4
  m = text.match(/([0-9]+(?:\.[0-9])?)\s*分/);
  if (m) { const v = parseFloat(m[1]); return Math.max(0, Math.min(5, Math.round(v > 5 ? v / 2 : v))); }
  if (/神作|封神|此生最爱/.test(text)) return 5;
  return undefined;
}

// 抽书名：《》优先；否则去「读了/在读/读完/标记/这本书」等噪声与评分尾巴
export function parseTitle(text: string): string {
  const t = (text || '').trim();
  const quoted = t.match(/《([^》]+)》/);
  if (quoted) return quoted[1].trim();
  let s = t
    .replace(/[0-9一二两三四五]\s*星半?|[0-9]+(?:\.[0-9])?\s*分|★+/g, ' ')
    .replace(/(帮我|给我|请|麻烦)?(标记|记录|记一下|记一笔|收藏|添加|标一下|标下)一?下?/g, ' ')
    .replace(/我?(刚|今天|昨天|最近)?(读完了?|读了|看完了?|看了|在读|刷完了?|啃完了?|读过)/g, ' ')
    .replace(/这本(书|小说)?|的?这本|想读|推荐/g, ' ')
    .replace(/[，,。.！!？?；;~、]+/g, ' ')
    .trim();
  // 保留整段（含词间空格），不再取最长段——否则含空格的多词书名被截断（同电影 sense 的修复）
  return s.replace(/\s+/g, ' ').trim();
}

export async function ocrTitle(imageDataUrl: string): Promise<string> {
  try {
    const text = await edgeSafe.vision(imageDataUrl, '这是一张书封或书页截图，只回答书名，不要其他文字。');
    return (text || '').trim().split('\n')[0].replace(/《|》/g, '').slice(0, 40).trim();
  } catch { return ''; }
}

export interface Sensed { title: string; rating?: number; from: 'quote' | 'ocr' | 'manual' }
export async function sense(input: { kind: 'text' | 'image' | 'manual'; text?: string; imageDataUrl?: string; manualTitle?: string; manualRating?: number }): Promise<Sensed> {
  if (input.kind === 'image' && input.imageDataUrl) return { title: await ocrTitle(input.imageDataUrl), from: 'ocr' };
  if (input.kind === 'manual') return { title: (input.manualTitle || '').trim(), rating: input.manualRating, from: 'manual' };
  const text = input.text || '';
  return { title: parseTitle(text), rating: parseRating(text), from: 'quote' };
}
