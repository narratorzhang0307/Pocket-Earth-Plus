// 真实地理编码（破"只认 ~100 城"限制）。三级：本地表 → Mapbox → 缓存。
//   1. 本地表 geocodeCity（即时/免费/主要城市精确）——命中即返回，不耗网络。
//   2. Mapbox Geocoding v6（全球长尾：任意国家/城市/区）——本地表未命中时兜底。
//      注：Mapbox 中国数据到「城市/区」级可靠，POI/山名级有限（如「天目山」可能认偏）；
//      故 pin 时由 spreadCoord 抖散，落点为城市/区级、由 label 承载具体地点名。
//   3. localStorage 缓存（同名不重复请求 + 首次后离线可用）。
// 解耦：只读应用层 token（import.meta.env，与 mapbox.ts 同源）+ 复用 geocodeCity，不碰内核。
import { geocodeCity } from '../../data/geoStickers';

const MAPBOX_TOKEN = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MAPBOX_TOKEN) || '';
const CACHE_KEY = 'pe.geocache.v1';

export interface GeoHit { place: string; lng: number; lat: number; source: 'local' | 'mapbox' }

let cache: Record<string, GeoHit | null> = (() => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
})();
function saveCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* ignore */ } }

// 清洗：把「杭州·西溪湿地」「北京，三里屯」里的分隔符换空格，利于 Mapbox 解析。
const clean = (s: string) => (s || '').replace(/[·•，,/｜|]+/g, ' ').replace(/\s+/g, ' ').trim();

/** 解析任意地名 → 坐标。本地表优先 → Mapbox 兜底 → 缓存。near 给邻近偏置（如主题城市坐标）。 */
export async function resolvePlace(query: string, opts?: { near?: [number, number] }): Promise<GeoHit | null> {
  const raw = (query || '').trim();
  if (!raw) return null;

  // 1. 本地表（原串 + 清洗串都试）
  const local = geocodeCity(raw) || geocodeCity(clean(raw));
  if (local) return { ...local, source: 'local' };

  // 2. 缓存
  const ckey = clean(raw).toLowerCase();
  if (ckey in cache) return cache[ckey];

  // 3. Mapbox
  if (!MAPBOX_TOKEN) { cache[ckey] = null; saveCache(); return null; }
  try {
    const u = new URL('https://api.mapbox.com/search/geocode/v6/forward');
    u.searchParams.set('q', clean(raw));
    u.searchParams.set('language', 'zh');
    u.searchParams.set('limit', '1');
    // 限定到城市/区级要素：实测能把「成都春熙路→日本」「马丘比丘→俄罗斯」这类错配纠回正确城市，
    // 全球城市/区级可靠（临安/库斯科/内罗毕等不在本地表也对）。POI 级精度交给 spreadCoord 抖散 + label。
    u.searchParams.set('types', 'region,place,locality,district');
    if (opts?.near) u.searchParams.set('proximity', `${opts.near[0]},${opts.near[1]}`);
    u.searchParams.set('access_token', MAPBOX_TOKEN);
    const r = await fetch(u.toString());
    if (r.ok) {
      const d = await r.json();
      const f = d?.features?.[0];
      const c = f?.geometry?.coordinates;
      if (Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        const hit: GeoHit = { place: (f.properties?.name as string) || clean(raw), lng: c[0], lat: c[1], source: 'mapbox' };
        cache[ckey] = hit; saveCache();
        return hit;
      }
    }
  } catch { /* 网络失败 → 记 miss，调用方走兜底 */ }
  cache[ckey] = null; saveCache();
  return null;
}
