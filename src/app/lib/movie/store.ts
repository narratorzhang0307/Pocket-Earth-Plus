// 记忆层：端侧持久化电影索引（IndexedDB `pe-movies`，归一片名为主键，增量幂等——
// 看过/标过的重跑直接命中，不再调云脑）。只存派生小结论（标签摘要 + 落点），不存截图原图。
// localStorage 存用户纠错偏好（评分/地点修正），供 critic 复用。
import type { GeoTarget, MovieTags } from './types';

export interface StoredMovie {
  key: string;                 // movieKey
  title: string;
  country: string;
  year: number | null;
  tags: MovieTags;
  geo: GeoTarget | null;
  pinned: boolean;
  enriched: boolean;           // 是否已云脑补全过（补过的重跑不再调）
  ts: number;
}

const DB = 'pe-movies', STORE = 'index', VER = 1;
let dbp: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') return res(null);
      const req = indexedDB.open(DB, VER);
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'key' }); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}
function tx(mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
  return open().then((d) => { try { return d ? d.transaction(STORE, mode).objectStore(STORE) : null; } catch { return null; } });
}

export async function getKnownMovie(key: string): Promise<StoredMovie | null> {
  const s = await tx('readonly'); if (!s) return null;
  return new Promise((res) => { const r = s.get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
}
export async function putMovie(m: StoredMovie): Promise<void> {
  const s = await tx('readwrite'); if (!s) return;
  try { s.put(m); } catch { /* 隐私模式忽略 */ }
}
export async function allMovies(): Promise<StoredMovie[]> {
  const s = await tx('readonly'); if (!s) return [];
  return new Promise((res) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });
}

// ── 用户纠错偏好（localStorage）：地点修正 + 评分修正，越用越准 ──
const PREF_KEY = 'pe.moviePrefs.v1';
export interface MoviePrefs {
  placeFix: Record<string, { lng: number; lat: number; place: string }>;   // movieKey → 用户手定落点
  ratingFix: Record<string, number>;                                        // movieKey → 用户手定星级
}
const DEFAULT: MoviePrefs = { placeFix: {}, ratingFix: {} };
export function getMoviePrefs(): MoviePrefs {
  try { if (typeof localStorage !== 'undefined') { const r = localStorage.getItem(PREF_KEY); if (r) return { ...DEFAULT, ...JSON.parse(r) }; } } catch { /* */ }
  return { placeFix: {}, ratingFix: {} };
}
function save(p: MoviePrefs) { try { if (typeof localStorage !== 'undefined') localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* */ } }
export function recordPlaceFix(key: string, fix: { lng: number; lat: number; place: string }) { const p = getMoviePrefs(); p.placeFix[key] = fix; save(p); }
export function recordRatingFix(key: string, stars: number) { const p = getMoviePrefs(); p.ratingFix[key] = Math.max(0, Math.min(5, stars)); save(p); }
