// 观影数据源（解耦）：豆瓣观影记录（douban-movies.json，已精简入库）→ 按「国家/地区」落到代表城市坐标，
// 同国多片用确定性微抖动散开。导出给地图的电影点 moviePoints，以及给「观影 curator」运行页用的记录与统计。
// 换数据只换 douban-movies.json；坐标映射在下方 COUNTRY_COORDS。

import raw from './douban-movies.json';

export interface MovieRecord {
  id: number;
  title: string;
  original: string;
  type: string;
  director: string;
  country: string;
  year: number | null;
  rating: number | null;
  date: string;       // 观看日期 YYYY-MM-DD
  synopsis: string;
}

// 清洗：导出残留的非标准日期（如个别为「删除」）归一为空，避免显示与排序异常
const isYMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const movieRecords: MovieRecord[] = (raw as MovieRecord[]).map((m) =>
  isYMD(m.date) ? m : { ...m, date: '' }
);
export const movieTotal = movieRecords.length;

// 国家/地区 → 代表城市坐标 [lng, lat]。电影偏好取「电影之都」气质的城市（美国→洛杉矶/好莱坞、印度→孟买）。
const COUNTRY_COORDS: Record<string, [number, number]> = {
  中国大陆: [116.40, 39.90], 美国: [-118.24, 34.05], 日本: [139.69, 35.68], 中国香港: [114.17, 22.32],
  法国: [2.35, 48.85], 英国: [-0.12, 51.50], 中国台湾: [121.56, 25.03], 韩国: [126.97, 37.56],
  意大利: [12.49, 41.90], 德国: [13.40, 52.52], 瑞典: [18.07, 59.33], 西班牙: [-3.70, 40.42],
  波兰: [21.01, 52.23], 芬兰: [24.94, 60.17], 加拿大: [-79.38, 43.65], 泰国: [100.50, 13.76],
  丹麦: [12.57, 55.68], 澳大利亚: [151.21, -33.87], 伊朗: [51.39, 35.69], 苏联: [37.62, 55.75],
  希腊: [23.73, 37.98], 墨西哥: [-99.13, 19.43], 印度: [72.88, 19.08], 南斯拉夫: [20.46, 44.79],
  智利: [-70.65, -33.46], 巴西: [-43.20, -22.91], 新西兰: [174.78, -41.29], 挪威: [10.75, 59.91],
  奥地利: [16.37, 48.21], 俄罗斯: [37.62, 55.75], 土耳其: [28.98, 41.01], 捷克斯洛伐克: [14.42, 50.09],
  匈牙利: [19.04, 47.50], 阿根廷: [-58.38, -34.60], 比利时: [4.35, 50.85], 爱尔兰: [-6.26, 53.35],
  塞尔维亚: [20.46, 44.79], 新加坡: [103.82, 1.35], 马来西亚: [101.69, 3.14], 哥伦比亚: [-74.07, 4.71],
  捷克: [14.42, 50.09], 南非: [18.42, -33.92], 荷兰: [4.90, 52.37], 葡萄牙: [-9.14, 38.72],
  瑞士: [8.54, 47.37], 黎巴嫩: [35.50, 33.89], 以色列: [34.78, 32.08], 哈萨克斯坦: [76.89, 43.24],
};

export const movieCountry = (c: string): [number, number] | undefined => COUNTRY_COORDS[c];
export const movieCountries = Object.keys(COUNTRY_COORDS);

export interface MoviePoint extends MovieRecord { lng: number; lat: number }

// 同国多片在城市附近散开（约 ±0.9°），缩小看是一团、放大能看出散布；无坐标（country 空/未收录）的不落地球。
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function spread(id: number, lng: number, lat: number): [number, number] {
  const h = hashStr('mv-' + id);
  const dlng = ((h & 0xffff) / 0xffff - 0.5) * 1.8;
  const dlat = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 1.8;
  return [lng + dlng, lat + dlat];
}

export const moviePoints: MoviePoint[] = movieRecords
  .map((m) => {
    const base = COUNTRY_COORDS[m.country];
    if (!base) return null;
    const [lng, lat] = spread(m.id, base[0], base[1]);
    return { ...m, lng, lat };
  })
  .filter((m): m is MoviePoint => !!m);

export const movieMappedTotal = moviePoints.length;
