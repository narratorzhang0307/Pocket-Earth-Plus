// 地图标记图层 · 统一数据模块（解耦、可扩展）
// 把不同来源的点（音乐城市 / 照片地点 / 将来更多）统一成 MapMarker，按 kind 区分颜色。
// 新增一类内容只要再 push 一组 marker + 在 MARKER_KINDS 里加一行即可，地图层与图例自动支持。

import musicCities from './music-cities.json';
import { photoPoints } from './photos';
import { moviePoints } from './movies';
import { bookPoints } from './books';

export type MarkerKind = 'music' | 'photo' | 'movie' | 'book' | 'travel';

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

// 图例 / 开关用的类型配置：标签 + 颜色（绿=音乐，青=照片，琥珀=电影，紫=书，玫红=行程）
export const MARKER_KINDS: { kind: MarkerKind; label: string; color: string }[] = [
  { kind: 'music', label: '音乐', color: '#00ff88' },
  { kind: 'photo', label: '照片', color: '#00e5ff' },
  { kind: 'movie', label: '电影', color: '#ffb000' },
  { kind: 'book', label: '书', color: '#b388ff' },
  { kind: 'travel', label: '行程', color: '#ff3b6b' },
];
export const KIND_COLOR: Record<MarkerKind, string> = { music: '#00ff88', photo: '#00e5ff', movie: '#ffb000', book: '#b388ff', travel: '#ff3b6b' };

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

const photoMarkers: MapMarker[] = photoPoints.map((p) => {
  const [lat, lng] = jitter('p-' + p.id, p.lat, p.lng);
  return { id: 'p-' + p.id, kind: 'photo', lat, lng, label: (p.city || '').split(',')[0], thumb: p.thumb, full: p.full,
    author: p.author, authorLink: p.authorLink, photoLink: p.photoLink };
});

// 电影点：豆瓣观影记录按国家落到代表城市（坐标与散开已在 movies.ts 算好），琥珀色小点
const movieMarkers: MapMarker[] = moviePoints.map((m) => ({
  id: 'mv-' + m.id, kind: 'movie', lat: m.lat, lng: m.lng, label: m.title,
}));

// 书点：读过的书钉到「故事/作者之地」（坐标在 books.ts），紫色点
const bookMarkers: MapMarker[] = bookPoints.map((b) => ({
  id: 'bk-' + b.id, kind: 'book', lat: b.lat, lng: b.lng, label: b.title,
}));

export const MAP_MARKERS: MapMarker[] = [...musicMarkers, ...photoMarkers, ...movieMarkers, ...bookMarkers];

// 点击查详情用的查找表（按带前缀的 marker id）：geojson 里只放 id，详情走这里查，保持要素轻量
export const photoById = new Map(photoPoints.map((p) => ['p-' + p.id, p]));
export const movieById = new Map(moviePoints.map((m) => ['mv-' + m.id, m]));
export const bookById = new Map(bookPoints.map((b) => ['bk-' + b.id, b]));

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
