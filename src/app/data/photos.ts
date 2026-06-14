// 照片数据源（解耦 + 自适应）：真实坐标(photo-places.json) + 本地图池(resource-library/photos)
// + 伪造时间(photo-dates.json，按索引给每张照片打 2020–2025 的时间戳)。
// 三视图（时间 / 日历 / 杂志）全部按时间戳「全量分组」派生——照片增减、年份跨度变化，三视图自动重排，
// 不再写死月份 / 年份 / 组数。换数据只换这三个源，UI 不动。
// 列表用 thumb（低清秒开），点开看 full（高清）。

import places from './photo-places.json';
import dates from './photo-dates.json';
import worldPhotos from './world-photos.json';

interface Place { id: string; city: string; lat: number; lng: number }
const PLACES = places as Place[];
const DATES = dates as string[];

// 本地图池（缩略 + 高清两版）
const fullMods = import.meta.glob('../../../resource-library/photos/full/*.jpg', { eager: true, query: '?url', import: 'default' });
const thumbMods = import.meta.glob('../../../resource-library/photos/thumb/*.jpg', { eager: true, query: '?url', import: 'default' });
const baseName = (p: string) => p.split('/').pop() || p;
const thumbBy: Record<string, string> = {};
for (const [k, v] of Object.entries(thumbMods)) thumbBy[baseName(k)] = v as string;
const IMG_POOL = Object.entries(fullMods)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => ({ thumb: thumbBy[baseName(k)] || (v as string), full: v as string }));

export interface Photo { id: string; city: string; lat: number; lng: number; thumb?: string; full?: string; date: string; author?: string; authorLink?: string; photoLink?: string }
interface WorldPhoto { id: string; city: string; lat: number; lng: number; thumb: string; full: string; date: string; author: string; authorLink: string; photoLink: string }

// 时间戳缺失时的确定性兜底（2020–2025），保证任何情况下每张都有 date
const pad = (n: number) => String(n).padStart(2, '0');
const fallbackDate = (i: number) => `${2020 + (i % 6)}-${pad(1 + ((i * 7) % 12))}-${pad(1 + ((i * 13) % 28))}`;

// 一条照片记录 = 真实坐标 + 图池里的一张（demo 循环）+ 伪造时间戳
const PLACE_PHOTOS: Photo[] = PLACES.map((pl, i) => {
  const img = IMG_POOL.length ? IMG_POOL[i % IMG_POOL.length] : undefined;
  return { id: pl.id, city: pl.city, lat: pl.lat, lng: pl.lng, thumb: img?.thumb, full: img?.full, date: DATES[i] || fallbackDate(i) };
});

// 世界日落照片（sunset-radio 精选，缩略+高清 + 真实经纬度 + Unsplash 署名 + 随机分布的日期）
const WORLD_PHOTOS: Photo[] = (worldPhotos as WorldPhoto[]).map((w) => ({
  id: w.id, city: w.city, lat: w.lat, lng: w.lng, thumb: w.thumb, full: w.full, date: w.date,
  author: w.author, authorLink: w.authorLink, photoLink: w.photoLink,
}));

// 给地图主展示页（annotations 手帐贴）用的几张好看照片：世界日落照片里取一小撮（缩略图已校验可用）
export const showcasePhotos: Photo[] = WORLD_PHOTOS.slice(0, 8);

const PHOTOS: Photo[] = [...PLACE_PHOTOS, ...WORLD_PHOTOS];

// 署名反查：按图片 URL（缩略 / 高清）查 Unsplash 摄影师，灯箱据此显示「Photo by … on Unsplash」
export interface PhotoCredit { author?: string; authorLink?: string; photoLink?: string }
const CREDIT = new Map<string, PhotoCredit>();
for (const w of WORLD_PHOTOS) {
  const c: PhotoCredit = { author: w.author, authorLink: w.authorLink, photoLink: w.photoLink };
  if (w.full) CREDIT.set(w.full, c);
  if (w.thumb) CREDIT.set(w.thumb, c);
}
export const photoCredit = (url?: string): PhotoCredit | undefined => (url ? CREDIT.get(url) : undefined);

// 给地图用的照片坐标点（即使图池缺失也有，靠 photo-places 入库的坐标）
export const photoPoints = PHOTOS;
export const photoTotal = PHOTOS.length;
export const hasPhotos = IMG_POOL.length > 0;

// 只有带图的进三视图，且按图片去重：本地图池只有 ~29 张会循环取用，去重后每张图只出现一次，
// 时间 / 日历 / 杂志都不再出现「同一张照片重复」（世界照片各不相同，全部保留）。
const seenThumb = new Set<string>();
const WITHIMG: Photo[] = PHOTOS.filter((p) => {
  if (!p.thumb || seenThumb.has(p.thumb)) return false;
  seenThumb.add(p.thumb);
  return true;
});

// —— 时间工具 ——
const ym = (d: string) => d.slice(0, 7);       // YYYY-MM
const yr = (d: string) => d.slice(0, 4);       // YYYY
const dayOf = (d: string) => parseInt(d.slice(8, 10), 10);
const cityShort = (c: string) => (c || '').split(',')[0];
function bucket<T>(m: Map<string, T[]>, k: string, v: T) { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

export interface TimelinePhoto { id: string; cap: string; img: string; full: string; rot: number }
export interface TimelineGroup { id: string; title: string; sub?: string; special?: boolean; photos: TimelinePhoto[] }
export interface CalendarCell { thumb: string; full: string; count: number }
export interface CalendarMonth { label: string; dim: number; days: Record<number, CalendarCell> }
export interface MagazinePhoto { id: string; thumb: string; full: string; date: string; city: string }
export interface MagazineYear { year: number; cover: string; photos: MagazinePhoto[] }

const ROTS = [-6, 5, -3, 7, -4, 6, -5, 4];

// —— 时间：按「年-月」分组，倒序；每组该月全部照片（自适应：有几个月就有几组）——
const tlMap = new Map<string, Photo[]>();
for (const p of [...WITHIMG].sort((a, b) => b.date.localeCompare(a.date))) bucket(tlMap, ym(p.date), p);
export const timelineGroups: TimelineGroup[] = [...tlMap.keys()].sort((a, b) => b.localeCompare(a)).map((k, gi) => {
  const ps = tlMap.get(k)!;
  return {
    id: 'tg' + k,
    title: k.replace('-', '.'),
    sub: `${ps.length} 张`,
    special: gi === 0,
    photos: ps.map((p, idx) => ({ id: `${p.id}-${k}-${idx}`, cap: `${cityShort(p.city)} · ${p.date}`, img: p.thumb!, full: p.full!, rot: ROTS[idx % ROTS.length] })),
  };
});

// —— 日历：每个有照片的月一页（倒序）；当月按「日」聚合（该天一张代表 + 张数）——
const calMap = new Map<string, Photo[]>();
for (const p of WITHIMG) bucket(calMap, ym(p.date), p);
export const calendarMonths: CalendarMonth[] = [...calMap.keys()].sort((a, b) => b.localeCompare(a)).map((k) => {
  const [y, m] = k.split('-').map(Number);
  const byDay = new Map<string, Photo[]>();
  for (const p of calMap.get(k)!) bucket(byDay, String(dayOf(p.date)), p);
  const days: Record<number, CalendarCell> = {};
  for (const [d, arr] of byDay) days[Number(d)] = { thumb: arr[0].thumb!, full: arr[0].full!, count: arr.length };
  return { label: `${y}.${pad(m)}`, dim: daysInMonth(y, m), days };
});

// —— 杂志：每年一刊（倒序）；该年全部照片（自适应：有几年就有几刊）——
const magMap = new Map<string, Photo[]>();
for (const p of WITHIMG) bucket(magMap, yr(p.date), p);
export const magazineYears: MagazineYear[] = [...magMap.keys()].sort((a, b) => b.localeCompare(a)).map((k) => {
  const ps = magMap.get(k)!;
  return { year: Number(k), cover: ps[0]?.thumb || '', photos: ps.map((p, i) => ({ id: `${p.id}-${k}-${i}`, thumb: p.thumb!, full: p.full!, date: p.date, city: cityShort(p.city) })) };
});
