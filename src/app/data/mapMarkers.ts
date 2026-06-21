// 地图标记图层 · 统一数据模块（解耦、可扩展）
// 把不同来源的点（音乐城市 / 照片地点 / 将来更多）统一成 MapMarker，按 kind 区分颜色。
// 新增一类内容只要再 push 一组 marker + 在 MARKER_KINDS 里加一行即可，地图层与图例自动支持。

import musicCities from './music-cities.json';
import { mapPhotoPoints } from './photos';
// 只引类型（编译期擦除，不会把 movies/books 及其 douban 大 JSON 拉进首屏 chunk）；
// 真正的数据在 ensureHeavyMarkers() 里动态 import。
import type { MoviePoint } from './movies';
import type { BookPoint } from './books';

// 'custom' = 用户用「造物主」meta-agent 自建的 agent 的落点（咖啡馆/球鞋/鸟类…全归这一类，
// 地球只认这一个通用类、不学习具体自定义 agent；各 agent 的身份/颜色在 meta 里，详见 lib/agent/）。
export type MarkerKind = 'music' | 'photo' | 'movie' | 'book' | 'travel' | 'council' | 'custom';

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  lat: number;
  lng: number;
  label?: string;   // 地球档显示的名字（如城市名）
  thumb?: string;
  full?: string;
  author?: string; authorLink?: string; photoLink?: string;  // Unsplash 署名（世界照片）
}

// 图例 / 开关用的类型配置：标签 + 颜色（绿=音乐，青=照片，琥珀=电影，紫=书，玫红=行程，金=议事，橙=自建）
export const MARKER_KINDS: { kind: MarkerKind; label: string; color: string }[] = [
  { kind: 'music', label: '音乐', color: '#00ff88' },
  { kind: 'photo', label: '照片', color: '#00e5ff' },
  { kind: 'movie', label: '电影', color: '#ffb000' },
  { kind: 'book', label: '书', color: '#b388ff' },
  { kind: 'travel', label: '行程', color: '#ff3b6b' },
  { kind: 'council', label: '议事', color: '#caa64a' },
  { kind: 'custom', label: '自建', color: '#ff8a3d' },
];
export const KIND_COLOR: Record<MarkerKind, string> = { music: '#00ff88', photo: '#00e5ff', movie: '#ffb000', book: '#b388ff', travel: '#ff3b6b', council: '#caa64a', custom: '#ff8a3d' };

// 确定性微偏移：同城 / 重合的点在城市附近散开（约 ±0.03°≈3km），放大后能看出分布在不同位置；
// 缩小时这点偏移看不出来，由地图层的聚合再把重合的只显示一个。
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function jitter(id: string, lat: number, lng: number): [number, number] {
  const h = hashStr(id);
  const dlat = ((h & 0xffff) / 0xffff - 0.5) * 0.06;
  const dlng = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 0.06;
  return [lat + dlat, lng + dlng];
}

interface MusicCity { slug: string; nameZh: string; lat: number; lng: number }

const musicMarkers: MapMarker[] = (musicCities as MusicCity[]).map((c) => {
  const [lat, lng] = jitter('m-' + c.slug, c.lat, c.lng);
  return { id: 'm-' + c.slug, kind: 'music', lat, lng, label: c.nameZh };
});

const photoMarkers: MapMarker[] = mapPhotoPoints.map((p) => {
  const [lat, lng] = jitter('p-' + p.id, p.lat, p.lng);
  return { id: 'p-' + p.id, kind: 'photo', lat, lng, label: (p.city || '').split(',')[0], thumb: p.thumb, full: p.full,
    author: p.author, authorLink: p.authorLink, photoLink: p.photoLink };
});

// 首屏地图只先渲染音乐 + 照片标记（数据小）。电影 / 书标记体量大（含豆瓣简介，约 1.3MB JSON），
// 改为地图就绪后懒加载补入（见 ensureHeavyMarkers），把大 JSON 移出首屏关键路径。
export const MAP_MARKERS: MapMarker[] = [...musicMarkers, ...photoMarkers];

// 点击查详情用的查找表（按带前缀的 marker id）：geojson 里只放 id，详情走这里查，保持要素轻量。
// 电影 / 书表初始为空，懒加载完成后填充（同一 Map 对象就地填充，外部持有的引用仍有效）。
export const photoById = new Map(mapPhotoPoints.map((p) => ['p-' + p.id, p]));
export const movieById = new Map<string, MoviePoint>();
export const bookById = new Map<string, BookPoint>();

let heavyLoaded = false;
let heavyPromise: Promise<void> | null = null;
// 懒加载电影 / 书标记 + 详情查找表：动态 import movies/books（含 douban 大 JSON），
// 把点 push 进 MAP_MARKERS、就地填充 byId 表。地图层在 resolve 后重建 marks 源即可显示这些点。
export function ensureHeavyMarkers(): Promise<void> {
  if (heavyLoaded) return Promise.resolve();
  if (heavyPromise) return heavyPromise;
  heavyPromise = Promise.all([import('./movies'), import('./books')]).then(([mv, bk]) => {
    for (const m of mv.moviePoints) {
      MAP_MARKERS.push({ id: 'mv-' + m.id, kind: 'movie', lat: m.lat, lng: m.lng, label: m.title });
      movieById.set('mv-' + m.id, m);
    }
    for (const b of bk.bookPoints) {
      MAP_MARKERS.push({ id: 'bk-' + b.id, kind: 'book', lat: b.lat, lng: b.lng, label: b.title });
      bookById.set('bk-' + b.id, b);
    }
    heavyLoaded = true;
  }).catch((e) => { heavyPromise = null; throw e; });   // 失败清缓存→下次切回地球 tab 重新 import；保持 reject 让上层 .catch 照常吞（否则一次瞬时 chunk 404/离线后电影·书标记整会话消失、不自愈）
  return heavyPromise;
}

// 转 GeoJSON，交给 mapbox symbol 图层原生渲染（贴地 / 背面遮挡 / 重叠碰撞都由 mapbox 处理）
export function toGeoJSON() {
  return {
    type: 'FeatureCollection' as const,
    features: MAP_MARKERS.map((m) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
      properties: { kind: m.kind, label: m.label || '', id: m.id },
    })),
  };
}
