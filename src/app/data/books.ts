// 读书数据源（解耦）：豆瓣阅读记录(douban-books.json，已精简入库)→ 按作者国籍落到代表城市坐标，
// 同国多本确定性散开，上地球（紫点），点开看 ≤100 字简介。做法对齐观影(movies.ts)。
// 另保留少量「故事之地」种子(SEED_BOOKS)与文学城市表(BOOK_PLACES)给读书 agent 的「记一本」选地点用。

import raw from './douban-books.json';

export interface BookRecord {
  id: number;
  title: string;
  author: string;
  country: string;     // 作者国籍（已清洗主国）
  type: string;
  year: number | null;
  rating: number | null;
  date: string;        // 读完日期 YYYY-MM-DD
  synopsis: string;    // ≤100 字简介
}

const isYMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const bookRecords: BookRecord[] = (raw as BookRecord[]).map((b) => (isYMD(b.date) ? b : { ...b, date: '' }));
export const bookTotal = bookRecords.length;

// 作者国籍 → 代表城市坐标 [lng, lat]（文学之都 / 首都；美国取纽约）
const COUNTRY_COORDS: Record<string, [number, number]> = {
  中国大陆: [116.40, 39.90], 中国: [116.40, 39.90], 中国台湾: [121.56, 25.03], 中国香港: [114.17, 22.32],
  美国: [-73.97, 40.78], 日本: [139.69, 35.68], 英国: [-0.12, 51.51], 法国: [2.35, 48.85],
  德国: [13.40, 52.52], 意大利: [12.49, 41.90], 爱尔兰: [-6.26, 53.35], 瑞士: [8.54, 47.37],
  智利: [-70.65, -33.46], 哥伦比亚: [-74.07, 4.71], 俄国: [37.62, 55.75], 俄罗斯: [37.62, 55.75], 苏联: [37.62, 55.75],
  阿根廷: [-58.38, -34.60], 波兰: [21.01, 52.23], 加拿大: [-79.38, 43.65], 马来西亚: [101.69, 3.14],
  韩国: [126.97, 37.56], 捷克: [14.42, 50.09], 墨西哥: [-99.13, 19.43], 荷兰: [4.90, 52.37],
  葡萄牙: [-9.14, 38.72], 西班牙: [-3.70, 40.42], 瑞典: [18.07, 59.33], 塞尔维亚: [20.46, 44.79],
  澳大利亚: [151.21, -33.87], 挪威: [10.75, 59.91], 古希腊: [23.73, 37.98], 希腊: [23.73, 37.98],
  斯洛文尼亚: [14.51, 46.06], 印度: [72.88, 19.08], 奥地利: [16.37, 48.21], 芬兰: [24.94, 60.17],
  南非: [18.42, -33.92], 罗马尼亚: [26.10, 44.43], 越南: [105.83, 21.03], 波斯: [51.39, 35.69], 伊朗: [51.39, 35.69],
  丹麦: [12.57, 55.68], 土耳其: [28.98, 41.01],
};
export const bookCountry = (c: string): [number, number] | undefined => COUNTRY_COORDS[c];

export interface BookPoint extends BookRecord { lng: number; lat: number }

// 同国多本在城市附近散开（±2.5°），缩小一团、放大见分布；无坐标（国籍未收录）不落地球
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function spread(id: number, lng: number, lat: number): [number, number] {
  const h = hashStr('bk-' + id);
  const dlng = ((h & 0xffff) / 0xffff - 0.5) * 2.5;
  const dlat = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 2.5;
  return [lng + dlng, lat + dlat];
}

export const bookPoints: BookPoint[] = bookRecords
  .map((b) => {
    const base = COUNTRY_COORDS[b.country];
    if (!base) return null;
    const [lng, lat] = spread(b.id, base[0], base[1]);
    return { ...b, lng, lat };
  })
  .filter((b): b is BookPoint => !!b);
export const bookMappedTotal = bookPoints.length;

// ——————————————————————————————————————————————
// 以下给「读书 agent · 记一本」选地点用：少量故事之地种子 + 常见文学城市表
// ——————————————————————————————————————————————
export interface BookSeed { id: string; title: string; author: string; place: string; lng: number; lat: number; year?: number; note?: string }
export const SEED_BOOKS: BookSeed[] = [
  { id: 'b01', title: '百年孤独', author: '加西亚·马尔克斯', place: '阿拉卡塔卡 · 哥伦比亚', lng: -74.19, lat: 10.59, year: 1967, note: '马孔多的雨下了四年十一个月零两天。' },
  { id: 'b03', title: '老人与海', author: '海明威', place: '哈瓦那 · 古巴', lng: -82.38, lat: 23.13, year: 1952, note: '人可以被毁灭，但不能被打败。' },
  { id: 'b06', title: '挪威的森林', author: '村上春树', place: '东京', lng: 139.70, lat: 35.69, year: 1987, note: '每个人都有属于自己的一片森林。' },
  { id: 'b14', title: '1984', author: '乔治·奥威尔', place: '伦敦', lng: -0.12, lat: 51.51, year: 1949, note: '老大哥在看着你。' },
];

export const BOOK_PLACES: { name: string; lng: number; lat: number }[] = [
  { name: '北京', lng: 116.40, lat: 39.90 }, { name: '上海', lng: 121.47, lat: 31.23 },
  { name: '杭州', lng: 120.15, lat: 30.27 }, { name: '湘西凤凰', lng: 109.60, lat: 27.95 },
  { name: '东京', lng: 139.70, lat: 35.69 }, { name: '大阪', lng: 135.50, lat: 34.69 },
  { name: '京都', lng: 135.77, lat: 35.01 }, { name: '首尔', lng: 126.97, lat: 37.56 },
  { name: '巴黎', lng: 2.35, lat: 48.85 }, { name: '伦敦', lng: -0.12, lat: 51.51 },
  { name: '都柏林', lng: -6.26, lat: 53.35 }, { name: '布拉格', lng: 14.42, lat: 50.09 },
  { name: '圣彼得堡', lng: 30.34, lat: 59.93 }, { name: '莫斯科', lng: 37.62, lat: 55.75 },
  { name: '纽约', lng: -73.97, lat: 40.78 }, { name: '哈瓦那', lng: -82.38, lat: 23.13 },
  { name: '波哥大', lng: -74.07, lat: 4.71 }, { name: '布宜诺斯艾利斯', lng: -58.38, lat: -34.60 },
  { name: '伊斯坦布尔', lng: 28.98, lat: 41.01 }, { name: '柏林', lng: 13.40, lat: 52.52 },
];
export const bookPlace = (name: string) => BOOK_PLACES.find((p) => p.name === name);
