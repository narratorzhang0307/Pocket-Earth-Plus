// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· 端侧持久化 —— 通用 keyed IndexedDB 对象库 + localStorage 纠错偏好
// ────────────────────────────────────────────────────────────────────────────
// movie/book/photo 的 store.ts 此前各写一套近乎逐字相同的 IDB 开库/读写、和一份 placeFix/ratingFix
// 纠错偏好（book/store.ts 第 1 行自己都写了"镜像 lib/movie/store.ts"）。这里把这两块各收口成一处，
// 各 curator 的 store.ts 退化成"声明实体类型 + 绑库名"几行。
//
// 关注点分离：本 skill 只管"按 key 存取对象"与"存用户纠错"，不关心存的是电影/书/照片（领域无关）。
// ════════════════════════════════════════════════════════════════════════════

// ── 通用 keyed IndexedDB 对象库（端侧、幂等、隐私模式静默降级）──
export interface KeyedStore<T> {
  get(key: string): Promise<T | null>;
  put(obj: T): Promise<void>;
  all(): Promise<T[]>;
}
export function keyedStore<T>(dbName: string, keyPath = 'key', storeName = 'index', version = 1): KeyedStore<T> {
  let dbp: Promise<IDBDatabase | null> | null = null;
  const open = (): Promise<IDBDatabase | null> => {
    if (dbp) return dbp;
    dbp = new Promise((res) => {
      try {
        if (typeof indexedDB === 'undefined') return res(null);
        const req = indexedDB.open(dbName, version);
        req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(storeName)) d.createObjectStore(storeName, { keyPath }); };
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      } catch { res(null); }
    });
    return dbp;
  };
  const tx = (mode: IDBTransactionMode): Promise<IDBObjectStore | null> =>
    open().then((d) => { try { return d ? d.transaction(storeName, mode).objectStore(storeName) : null; } catch { return null; } });
  return {
    async get(key) { const s = await tx('readonly'); if (!s) return null; return new Promise((res) => { const r = s.get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); },
    async put(obj) { const s = await tx('readwrite'); if (!s) return; try { s.put(obj); } catch { /* 隐私模式忽略 */ } },
    async all() { const s = await tx('readonly'); if (!s) return []; return new Promise((res) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); },
  };
}

// ── 用户纠错偏好（localStorage）：地点修正 + 评分修正，越用越准；供反思层(critic)读取 ──
export interface Corrections {
  placeFix: Record<string, { lng: number; lat: number; place: string }>;   // key → 用户手定落点
  ratingFix: Record<string, number>;                                        // key → 用户手定星级 0-5
}
export interface CorrectionsStore {
  get(): Corrections;
  recordPlaceFix(key: string, fix: { lng: number; lat: number; place: string }): void;
  recordRatingFix(key: string, stars: number): void;
}
export function correctionsStore(prefKey: string): CorrectionsStore {
  const read = (): Corrections => {
    try { if (typeof localStorage !== 'undefined') { const r = localStorage.getItem(prefKey); if (r) return { placeFix: {}, ratingFix: {}, ...JSON.parse(r) }; } } catch { /* */ }
    return { placeFix: {}, ratingFix: {} };
  };
  const save = (p: Corrections) => { try { if (typeof localStorage !== 'undefined') localStorage.setItem(prefKey, JSON.stringify(p)); } catch { /* */ } };
  return {
    get: read,
    recordPlaceFix(key, fix) { const p = read(); p.placeFix[key] = fix; save(p); },
    recordRatingFix(key, stars) { const p = read(); p.ratingFix[key] = Math.max(0, Math.min(5, stars)); save(p); },
  };
}
