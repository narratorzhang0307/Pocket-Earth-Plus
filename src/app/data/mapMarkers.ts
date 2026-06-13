// 地图标记图层 · 统一数据模块（解耦、可扩展）
// 把不同来源的点（音乐城市 / 照片地点 / 将来更多）统一成 MapMarker，按 kind 区分颜色。
// 新增一类内容只要再 push 一组 marker + 在 MARKER_KINDS 里加一行即可，地图层与图例自动支持。

import musicCities from './music-cities.json';
import { photoPoints } from './photos';

export type MarkerKind = 'music' | 'photo';

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  lat: number;
  lng: number;
  label?: string;   // 地球档显示的名字（如城市名）
  thumb?: string;
  full?: string;
}

// 图例 / 开关用的类型配置：标签 + 颜色（绿=音乐，青=照片）
export const MARKER_KINDS: { kind: MarkerKind; label: string; color: string }[] = [
  { kind: 'music', label: '音乐', color: '#00ff88' },
  { kind: 'photo', label: '照片', color: '#00e5ff' },
];
export const KIND_COLOR: Record<MarkerKind, string> = { music: '#00ff88', photo: '#00e5ff' };

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
  return { id: 'p-' + p.id, kind: 'photo', lat, lng, label: (p.city || '').split(',')[0], thumb: p.thumb, full: p.full };
});

export const MAP_MARKERS: MapMarker[] = [...musicMarkers, ...photoMarkers];

// 转 GeoJSON，交给 mapbox symbol 图层原生渲染（贴地 / 背面遮挡 / 重叠碰撞都由 mapbox 处理）
export function toGeoJSON() {
  return {
    type: 'FeatureCollection' as const,
    features: MAP_MARKERS.map((m) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
      properties: { kind: m.kind, label: m.label || '' },
    })),
  };
}
