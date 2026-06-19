// 记忆·知识层：本地豆瓣读书库当 RAG 知识底座（确定性、可离线）。归一书名模糊匹配 → 作者/国家/年份/评分/简介。
import { bookRecords, type BookRecord } from '../../data/books';

function norm(s: string): string {
  return (s || '').replace(/\(\d{4}\)|（\d{4}）/g, '').replace(/[《》\s·\-—:：,，.。!！?？'"'']/g, '').toLowerCase();
}

let index: Map<string, BookRecord> | null = null;
function getIndex(): Map<string, BookRecord> {
  if (index) return index;
  const m = new Map<string, BookRecord>();
  for (const r of bookRecords) { const k = norm(r.title); if (k && !m.has(k)) m.set(k, r); }
  index = m;
  return m;
}

export interface CatalogHit { record: BookRecord; exact: boolean }

export function matchInCatalog(title: string): CatalogHit | null {
  const q = norm(title);
  if (!q) return null;
  const idx = getIndex();
  const exact = idx.get(q);
  if (exact) return { record: exact, exact: true };
  if (q.length >= 2) {
    let best: BookRecord | null = null;
    for (const [k, r] of idx) {
      if (k.length < 2) continue;
      if ((k.includes(q) || q.includes(k)) && Math.abs(k.length - q.length) <= 1) {   // 收紧 ≤1：避免短名前缀误命中（同电影 catalog）
        if (!best || Math.abs(k.length - q.length) < Math.abs(norm(best.title).length - q.length)) best = r;
      }
    }
    if (best) return { record: best, exact: false };
  }
  return null;
}

// 这本书用户读过吗（命中本地豆瓣读书全集 = 已读）。用于推荐时把已读的剔除/标注。
export function seenBefore(title: string): BookRecord | null {
  const h = matchInCatalog(title);
  return h ? h.record : null;
}
