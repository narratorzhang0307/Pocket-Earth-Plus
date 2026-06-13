// 照片数据源（解耦）：从本地 resource-library/photos 加载缩略图(thumb)与高清(full)两版，
// 确定性随机派生「时间 / 日历 / 杂志」三种分布。换照片只换 photos/ 目录，三视图自动重排。
// 列表展示用 thumb（低清、快），点开看 full（高清）。照片私有不入库；缺失时三视图显示空态。

interface RawPhoto { id: string; thumb: string; full: string }

const fullMods = import.meta.glob('../../../resource-library/photos/full/*.jpg', { eager: true, query: '?url', import: 'default' });
const thumbMods = import.meta.glob('../../../resource-library/photos/thumb/*.jpg', { eager: true, query: '?url', import: 'default' });
const baseName = (p: string) => p.split('/').pop() || p;
const thumbBy: Record<string, string> = {};
for (const [k, v] of Object.entries(thumbMods)) thumbBy[baseName(k)] = v as string;
const RAW: RawPhoto[] = Object.entries(fullMods)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => ({ id: baseName(k).replace(/\.jpg$/, ''), thumb: thumbBy[baseName(k)] || (v as string), full: v as string }));

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
const POOL: RawPhoto[] = [...RAW];
for (let i = POOL.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [POOL[i], POOL[j]] = [POOL[j], POOL[i]];
}

let cursor = 0;
const take = (n: number): RawPhoto[] => {
  if (!POOL.length) return [];
  const out: RawPhoto[] = [];
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
];
export const timelineGroups: TimelineGroup[] = TL_LABELS.map((l, gi) => {
  const n = 3 + ((gi + 1) % 3); // 3~5 张
  return {
    id: 'tg' + gi,
    ...l,
    photos: take(n).map((p, idx) => ({
      id: p.id + '-' + gi + '-' + idx,
      cap: `日落 · ${HOURS[(gi + idx) % HOURS.length]}`,
      img: p.thumb,
      full: p.full,
      rot: ROTS[idx % ROTS.length],
    })),
  };
});

// —— 日历：2025.06，随机选若干天，每天若干张 ——
export const calendarPhotos: Record<number, CalendarCell> = {};
{
  const cap = Math.min(14, POOL.length ? 14 : 0);
  const litDays = new Set<number>();
  let guard = 0;
  while (litDays.size < cap && guard++ < 400) litDays.add(1 + Math.floor(rand() * 30));
  for (const day of litDays) {
    const cover = take(1)[0];
    if (cover) calendarPhotos[day] = { thumb: cover.thumb, full: cover.full, count: 1 + Math.floor(rand() * 12) };
  }
}

// —— 杂志：按年份相册，每年一组 ——
const YEARS = [2025, 2024, 2023, 2022, 2021, 2020];
export const magazineYears: MagazineYear[] = YEARS.map((year, yi) => {
  const n = 6 + ((yi * 2) % 7); // 6~12 张
  const photos = take(n).map((p, i) => ({ id: p.id + '-' + year + '-' + i, thumb: p.thumb, full: p.full }));
  return { year, cover: photos[0]?.thumb || '', photos };
}).filter((y) => y.photos.length > 0);

export const photoTotal = POOL.length;
export const hasPhotos = POOL.length > 0;
