// 记忆·知识层：把本地豆瓣观影库当 RAG 知识底座（确定性、可离线）。
// 归一化片名模糊匹配 → 命中即拿到 导演/国家/年份/豆瓣分/简介 这些确定锚点，省一次云脑调用。
import { movieRecords, doubanRating, type MovieRecord } from '../../data/movies';

// 与 types.movieKey 同口径的归一（去标点空格、小写、去掉结尾年份括号）
function norm(s: string): string {
  return (s || '')
    .replace(/\(\d{4}\)|（\d{4}）/g, '')
    .replace(/[《》\s·\-—:：,，.。!！?？'"'']/g, '')
    .toLowerCase();
}

// 预建归一索引（一次性，避免每次扫全库）
let index: Map<string, MovieRecord> | null = null;
function getIndex(): Map<string, MovieRecord> {
  if (index) return index;
  const m = new Map<string, MovieRecord>();
  for (const r of movieRecords) {
    for (const name of [r.title, r.original]) {
      const k = norm(name);
      if (k && !m.has(k)) m.set(k, r);
    }
  }
  index = m;
  return m;
}

export interface CatalogHit { record: MovieRecord; douban?: number; exact: boolean }

// 片名 → 本地库记录。先精确归一命中，再做包含式模糊（处理「教父2」↔「教父 第二部」这类）。
export function matchInCatalog(title: string): CatalogHit | null {
  const q = norm(title);
  if (!q) return null;
  const idx = getIndex();
  const exact = idx.get(q);
  if (exact) return { record: exact, douban: doubanRating(exact.id), exact: true };
  // 模糊：归一后互相包含（取最短候选，避免「猫」命中「猫鼠游戏」式过宽——要求 q≥2 且长度接近）
  if (q.length >= 2) {
    let best: MovieRecord | null = null;
    for (const [k, r] of idx) {
      if (k.length < 2) continue;
      if ((k.includes(q) || q.includes(k)) && Math.abs(k.length - q.length) <= 1) {   // 收紧 ≤1：避免 记忆碎片→记忆、小丑回魂→小丑 这类前缀误命中
        if (!best || Math.abs(k.length - q.length) < Math.abs(norm(best.title).length - q.length)) best = r;
      }
    }
    if (best) return { record: best, douban: doubanRating(best.id), exact: false };
  }
  return null;
}

// 库里是否已看过该片（用于「这部你 2019 看过」的提示，纯本地）
export function seenBefore(title: string): MovieRecord | null {
  const h = matchInCatalog(title);
  return h?.record || null;
}
