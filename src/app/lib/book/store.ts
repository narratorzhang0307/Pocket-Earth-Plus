// 记忆层：端侧持久化读书索引（IndexedDB `pe-books`，归一书名为主键，幂等）+ localStorage 纠错偏好。镜像 lib/movie/store.ts。
import type { GeoTarget, BookTags } from './types';

export interface StoredBook {
  key: string;
  title: string;
  country: string;
  year: number | null;
  tags: BookTags;
  geo: GeoTarget | null;
  pinned: boolean;
  enriched: boolean;
  ts: number;
}

const DB = 'pe-books', STORE = 'index', VER = 1;
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

export async function getKnownBook(key: string): Promise<StoredBook | null> {
  const s = await tx('readonly'); if (!s) return null;
  return new Promise((res) => { const r = s.get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
}
export async function putBook(b: StoredBook): Promise<void> {
  const s = await tx('readwrite'); if (!s) return;
  try { s.put(b); } catch { /* 隐私模式忽略 */ }
}
export async function allBooks(): Promise<StoredBook[]> {
  const s = await tx('readonly'); if (!s) return [];
  return new Promise((res) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });
}

const PREF_KEY = 'pe.bookPrefs.v1';
export interface BookPrefs { placeFix: Record<string, { lng: number; lat: number; place: string }>; ratingFix: Record<string, number> }
const DEFAULT: BookPrefs = { placeFix: {}, ratingFix: {} };
export function getBookPrefs(): BookPrefs {
  try { if (typeof localStorage !== 'undefined') { const r = localStorage.getItem(PREF_KEY); if (r) return { ...DEFAULT, ...JSON.parse(r) }; } } catch { /* */ }
  return { placeFix: {}, ratingFix: {} };
}
function save(p: BookPrefs) { try { if (typeof localStorage !== 'undefined') localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* */ } }
export function recordPlaceFix(key: string, fix: { lng: number; lat: number; place: string }) { const p = getBookPrefs(); p.placeFix[key] = fix; save(p); }
export function recordRatingFix(key: string, stars: number) { const p = getBookPrefs(); p.ratingFix[key] = Math.max(0, Math.min(5, stars)); save(p); }
