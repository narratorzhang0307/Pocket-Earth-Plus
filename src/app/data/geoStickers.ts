// 地图心情贴 · 数据层（自带经纬度 + 持久化）
// 用户在赛博浏览地球时随手贴下「此刻的心情」；每条心情贴绑定一个真实经纬度（端侧从文字判地名，
// 判不出就用当前地图中心），所以地球缩放 / 平移到任意程度，心情贴都钉在原地，不跟屏幕跑。
// localStorage 发布订阅，刷新不丢。地名识别走端侧 Selector 契约入口（edgeSafe.chat），失败安全降级。

import { edgeSafe } from '../../../frost-agent/edge/contract';

export interface MoodSticker {
  id: string;
  lat: number;
  lng: number;
  text: string;       // 心情文字
  place: string;      // 识别出的地名（或「此处」）
  color: string;      // 贴纸色
  rot: number;        // 轻微旋转
  createdAt: string;
  variant?: 'color' | 'card'; // color=彩色心情贴（默认）；card=白色 LOC_SYNC 卡片
  date?: string;      // card 变体头部日期（如 03.22）
}

const KEY = 'pe.geoStickers.v1';

function load(): MoodSticker[] {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
let stickers: MoodSticker[] = load();
const subs = new Set<() => void>();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(stickers)); } catch { /* 隐私模式忽略 */ } }
function emit() { subs.forEach((fn) => fn()); }

export function getMoodStickers(): MoodSticker[] { return stickers; }
export function addMoodSticker(s: Omit<MoodSticker, 'createdAt'> & { createdAt?: string }): MoodSticker {
  const full: MoodSticker = { ...s, createdAt: s.createdAt || new Date().toISOString() };
  stickers = [full, ...stickers];
  persist(); emit();
  return full;
}
export function removeMoodSticker(id: string) { stickers = stickers.filter((s) => s.id !== id); persist(); emit(); }
// 拖动中：仅更新内存位置并通知重渲染（不落盘，避免每帧写 localStorage）
export function updateMoodStickerPos(id: string, lat: number, lng: number) {
  stickers = stickers.map((s) => (s.id === id ? { ...s, lat, lng } : s));
  emit();
}
// 拖动结束：落盘
export function commitStickers() { persist(); }
// 把「已有的白色卡片」种入便贴库。版本化：改种子内容（如卡片诗句）时把 SEED_VERSION +1，
// 已种过的浏览器会重新同步种子卡片的文字——非破坏性：保留用户自建的心情贴，
// 也保留用户拖动过的种子卡片位置，只覆盖文字 / 日期等种子内容。
const SEED_VERSION = '2';
export function seedStickers(seeds: Array<Omit<MoodSticker, 'createdAt'>>) {
  const flagKey = KEY + '.seeded';
  let prev = '';
  try { prev = localStorage.getItem(flagKey) || ''; } catch { /* 隐私模式：当作未种 */ }
  if (prev === SEED_VERSION) return;                       // 已是最新种子版本
  const ids = new Set(seeds.map((s) => s.id));
  const prevById = new Map(stickers.map((s) => [s.id, s]));
  const userStickers = stickers.filter((s) => !ids.has(s.id)); // 保留用户自建贴
  const seeded = seeds.map((s) => {
    const old = prevById.get(s.id);                         // 已存在则保留其位置（用户可能拖过）
    return { ...s, ...(old ? { lat: old.lat, lng: old.lng } : {}), createdAt: old?.createdAt || new Date().toISOString() };
  });
  stickers = [...seeded, ...userStickers];
  persist(); emit();
  try { localStorage.setItem(flagKey, SEED_VERSION); } catch { /* ignore */ }
}
export function subscribeMood(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

// 贴纸暖色调色板（按文字 hash 选，稳定）
const STICKER_COLORS = ['#ffe08a', '#ffc4d6', '#c4e7ff', '#c9f0c4', '#e4d2ff', '#ffd2b0'];
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function pickStickerColor(text: string): string { return STICKER_COLORS[hash(text) % STICKER_COLORS.length]; }
export function pickRot(seed: string): number { return ((hash(seed) % 9) - 4); }

// 地名 → 经纬度 [lng, lat]（城市级，中英文别名）。端侧/字典共用。
const PLACE_COORDS: Record<string, [number, number]> = {
  杭州: [120.15, 30.27], hangzhou: [120.15, 30.27], 西湖: [120.14, 30.24],
  北京: [116.40, 39.90], beijing: [116.40, 39.90], 上海: [121.47, 31.23], shanghai: [121.47, 31.23],
  广州: [113.26, 23.13], 深圳: [114.06, 22.54], 成都: [104.07, 30.66], chengdu: [104.07, 30.66],
  重庆: [106.55, 29.56], 西安: [108.94, 34.34], 南京: [118.80, 32.06], 武汉: [114.30, 30.59],
  厦门: [118.09, 24.48], 大理: [100.27, 25.61], 丽江: [100.23, 26.86], 拉萨: [91.14, 29.65],
  青岛: [120.38, 36.07], 苏州: [120.62, 31.30], 香港: [114.17, 22.32], hongkong: [114.17, 22.32], 台北: [121.56, 25.03], taipei: [121.56, 25.03],
  东京: [139.69, 35.68], tokyo: [139.69, 35.68], 大阪: [135.50, 34.69], osaka: [135.50, 34.69], 京都: [135.77, 35.01], kyoto: [135.77, 35.01],
  首尔: [126.97, 37.56], seoul: [126.97, 37.56], 曼谷: [100.50, 13.76], bangkok: [100.50, 13.76], 新加坡: [103.82, 1.35], singapore: [103.82, 1.35],
  巴厘岛: [115.19, -8.41], bali: [115.19, -8.41], 吉隆坡: [101.69, 3.14], 清迈: [98.99, 18.79],
  巴黎: [2.35, 48.85], paris: [2.35, 48.85], 伦敦: [-0.12, 51.51], london: [-0.12, 51.51], 柏林: [13.40, 52.52], berlin: [13.40, 52.52],
  罗马: [12.49, 41.90], rome: [12.49, 41.90], 巴塞罗那: [2.17, 41.39], barcelona: [2.17, 41.39], 马德里: [-3.70, 40.42],
  阿姆斯特丹: [4.90, 52.37], amsterdam: [4.90, 52.37], 里斯本: [-9.14, 38.72], lisbon: [-9.14, 38.72], 布拉格: [14.42, 50.09], prague: [14.42, 50.09],
  维也纳: [16.37, 48.21], 威尼斯: [12.34, 45.44], 伊斯坦布尔: [28.98, 41.01], istanbul: [28.98, 41.01], 雅典: [23.73, 37.98],
  斯德哥尔摩: [18.07, 59.33], 哥本哈根: [12.57, 55.68], 冰岛: [-21.94, 64.13], iceland: [-21.94, 64.13], 雷克雅未克: [-21.94, 64.13],
  纽约: [-73.97, 40.78], newyork: [-73.97, 40.78], 洛杉矶: [-118.24, 34.05], losangeles: [-118.24, 34.05], 旧金山: [-122.42, 37.77], sanfrancisco: [-122.42, 37.77],
  芝加哥: [-87.62, 41.88], chicago: [-87.62, 41.88], 西雅图: [-122.33, 47.61], 波士顿: [-71.06, 42.36], 迈阿密: [-80.19, 25.76],
  墨西哥城: [-99.13, 19.43], 哈瓦那: [-82.38, 23.13], havana: [-82.38, 23.13], 里约: [-43.20, -22.91], rio: [-43.20, -22.91], 布宜诺斯艾利斯: [-58.38, -34.60], 圣保罗: [-46.63, -23.55],
  开罗: [31.24, 30.04], cairo: [31.24, 30.04], 开普敦: [18.42, -33.92], capetown: [18.42, -33.92], 内罗毕: [36.82, -1.29], 马拉喀什: [-7.98, 31.63],
  悉尼: [151.21, -33.87], sydney: [151.21, -33.87], 墨尔本: [144.96, -37.81], melbourne: [144.96, -37.81], 奥克兰: [174.76, -36.85],
  迪拜: [55.27, 25.20], dubai: [55.27, 25.20], 孟买: [72.88, 19.08], mumbai: [72.88, 19.08], 新德里: [77.21, 28.61], 加德满都: [85.32, 27.70], kathmandu: [85.32, 27.70],
};

function matchPlace(s: string): { place: string; lng: number; lat: number } | null {
  if (!s) return null;
  const low = s.toLowerCase();
  for (const [k, v] of Object.entries(PLACE_COORDS)) {
    if (/^[a-z]+$/.test(k)) {
      // 英文键用词边界匹配，避免短键被无关地名的子串误命中（Paristhana→paris、Balikpapan→bali、Old Berliner→berlin）
      if (new RegExp(`\\b${k}\\b`, 'i').test(low)) return { place: k, lng: v[0], lat: v[1] };
    } else if (s.includes(k)) {
      return { place: k, lng: v[0], lat: v[1] };   // 中文键无词边界，保留子串匹配
    }
  }
  return null;
}

// 城市级地理解析（字典直配，纯本地、可离线）。供电影/读书等 agent 的「取景地/故事地」子 agent 复用，
// 避免各处重复维护城市坐标表。匹配不到返回 null，调用方自行回退到国家坐标或端侧提名。
export function geocodeCity(name: string): { place: string; lng: number; lat: number } | null {
  return matchPlace(name);
}

// 坐标 → 最近的已知中文城市（粗反查）。给照片钉地球填城市名 + 回流长期画像用。
// 超过 maxKm 视为不在任何已知城市附近，返回 null（照片就不带城市、也不回流，避免乱填）。
export function nearestCity(lat: number, lng: number, maxKm = 80): { place: string; lng: number; lat: number } | null {
  let best: { place: string; lng: number; lat: number } | null = null;
  let bestKm = Infinity;
  for (const [k, v] of Object.entries(PLACE_COORDS)) {
    if (!/[一-龥]/.test(k)) continue;   // 只回中文城市名，跳过英文别名
    const dLat = (lat - v[1]) * 111;
    const dLng = (lng - v[0]) * 111 * Math.cos((lat * Math.PI) / 180);
    const km = Math.sqrt(dLat * dLat + dLng * dLng);
    if (km < bestKm) { bestKm = km; best = { place: k, lng: v[0], lat: v[1] }; }
  }
  return best && bestKm <= maxKm ? best : null;
}

// 从心情文字解析经纬度：本地字典直配 → 端侧提地名 → 兜底用当前地图中心
export async function resolveMoodPlace(text: string, fallback: [number, number]): Promise<{ place: string; lng: number; lat: number }> {
  const direct = matchPlace(text);
  if (direct) return direct;
  try {
    const name = await edgeSafe.chat(text, { system: '从这句话里找出一个地名（城市或国家），只输出地名本身，不要其他字；没有地名就输出 NONE。' });
    const m = matchPlace((name || '').trim());
    if (m) return m;
  } catch { /* 端侧不可用 → 兜底 */ }
  return { place: '此处', lng: fallback[0], lat: fallback[1] };
}

// 没判出地名时，随机落到一座城市（赛博漫游到随机一处）
export function randomPlace(): { place: string; lng: number; lat: number } {
  const ks = Object.keys(PLACE_COORDS);
  const k = ks[Math.floor(Math.random() * ks.length)];
  return { place: k, lng: PLACE_COORDS[k][0], lat: PLACE_COORDS[k][1] };
}
