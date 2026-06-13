// 照片数据源（解耦）：用真实城市坐标（photo-places.json，入库）+ 本地图池（resource-library/photos，
// 私有不入库）组合出一批照片记录，确定性随机派生「时间 / 日历 / 杂志」三视图，并导出坐标点给地图用。
// demo 阶段图片在本地图池里循环；换成真照片只需把 photo-places 与图池替换，三视图与地图点自动重排。
// 列表用 thumb（低清、秒开），点开看 full（高清）。

import places from './photo-places.json';

interface Place { id: string; city: string; lat: number; lng: number }
const PLACES = places as Place[];

// 本地图池（缩略 + 高清两版）
const fullMods = import.meta.glob('../../../resource-library/photos/full/*.jpg', { eager: true, query: '?url', import: 'default' });
const thumbMods = import.meta.glob('../../../resource-library/photos/thumb/*.jpg', { eager: true, query: '?url', import: 'default' });
const baseName = (p: string) => p.split('/').pop() || p;
const thumbBy: Record<string, string> = {};
for (const [k, v] of Object.entries(thumbMods)) thumbBy[baseName(k)] = v as string;
const IMG_POOL = Object.entries(fullMods)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => ({ thumb: thumbBy[baseName(k)] || (v as string), full: v as string }));

export interface Photo { id: string; city: string; lat: number; lng: number; thumb?: string; full?: string }

// 一条照片记录 = 真实坐标 + 图池里的一张（demo 循环）。图池缺失（clone）时 thumb/full 为空，地图点仍可显示。
const PHOTOS: Photo[] = PLACES.map((pl, i) => {
  const img = IMG_POOL.length ? IMG_POOL[i % IMG_POOL.length] : undefined;
  return { id: pl.id, city: pl.city, lat: pl.lat, lng: pl.lng, thumb: img?.thumb, full: img?.full };
});

// 给地图用的照片坐标点（即使图池缺失也有，靠 photo-places 入库的坐标）
export const photoPoints = PHOTOS;
export const photoTotal = PHOTOS.length;
export const hasPhotos = IMG_POOL.length > 0;

// —— 确定性伪随机（固定种子，刷新不抖动）——
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20250613);
const POOL: Photo[] = PHOTOS.filter((p) => p.thumb); // 只有带图的进三视图
for (let i = POOL.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [POOL[i], POOL[j]] = [POOL[j], POOL[i]];
}
let cursor = 0;
const take = (n: number): Photo[] => {
  if (!POOL.length) return [];
  const out: Photo[] = [];
  for (let i = 0; i < n; i++) out.push(POOL[cursor++ % POOL.length]);
  return out;
};

export interface TimelinePhoto { id: string; cap: string; img: string; full: string; rot: number }
export interface TimelineGroup { id: string; title: string; sub?: string; special?: boolean; photos: TimelinePhoto[] }
export interface CalendarCell { thumb: string; full: string; count: number }
export interface MagazinePhoto { id: string; thumb: string; full: string }
export interface MagazineYear { year: number; cover: string; photos: MagazinePhoto[] }

const ROTS = [-6, 5, -3, 7, -4, 6, -5, 4];
const HOURS = ['08:30', '11:10', '14:20', '16:30', '17:45', '18:30', '19:15', '20:40'];

// —— 时间：按日期分组的 Polaroid 堆 ——
const TL_LABELS: { title: string; sub?: string; special?: boolean }[] = [
  { title: '昨天', special: true },
  { title: '6月12日', sub: '周四' },
  { title: '6月11日', sub: '周三' },
  { title: '6月9日', sub: '周一' },
  { title: '6月7日', sub: '周六' },
  { title: '6月5日', sub: '周四' },
];
export const timelineGroups: TimelineGroup[] = TL_LABELS.map((l, gi) => {
  const n = 3 + ((gi + 1) % 3); // 3~5 张
  return {
    id: 'tg' + gi,
    ...l,
    photos: take(n).map((p, idx) => ({
      id: p.id + '-' + gi + '-' + idx,
      cap: `${(p.city || '').split(',')[0]} · ${HOURS[(gi + idx) % HOURS.length]}`,
      img: p.thumb!,
      full: p.full!,
      rot: ROTS[idx % ROTS.length],
    })),
  };
});

// —— 日历：多个月，每月随机选若干天（支持左右切月）——
export interface CalendarMonth { label: string; dim: number; days: Record<number, CalendarCell> }
const MONTHS = [
  { y: 2025, m: 6, dim: 30 }, { y: 2025, m: 5, dim: 31 },
  { y: 2025, m: 4, dim: 30 }, { y: 2025, m: 3, dim: 31 },
];
export const calendarMonths: CalendarMonth[] = MONTHS.map(({ y, m, dim }) => {
  const days: Record<number, CalendarCell> = {};
  if (POOL.length) {
    const cap = 12 + Math.floor(rand() * 6);
    const lit = new Set<number>();
    let guard = 0;
    while (lit.size < cap && guard++ < 400) lit.add(1 + Math.floor(rand() * dim));
    for (const d of lit) {
      const c = take(1)[0];
      if (c) days[d] = { thumb: c.thumb!, full: c.full!, count: 1 + Math.floor(rand() * 15) };
    }
  }
  return { label: `${y}.${String(m).padStart(2, '0')}`, dim, days };
});

// —— 杂志：按年份相册，每年一组 ——
const YEARS = [2025, 2024, 2023, 2022, 2021, 2020];
export const magazineYears: MagazineYear[] = YEARS.map((year, yi) => {
  const n = 8 + ((yi * 3) % 10); // 8~17 张
  const photos = take(n).map((p, i) => ({ id: p.id + '-' + year + '-' + i, thumb: p.thumb!, full: p.full! }));
  return { year, cover: photos[0]?.thumb || '', photos };
}).filter((y) => y.photos.length > 0);
