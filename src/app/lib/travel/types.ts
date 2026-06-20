// 类型层：行程 agent 的领域类型。B 线（规划）+ A 线（手动存档版 P0）。对齐 movie/types.ts。
export type Pref = '美食' | '历史' | '自然' | '艺术' | '夜生活' | '小众' | '购物';
export const PREFERENCES: Pref[] = ['美食', '历史', '自然', '艺术', '夜生活', '小众', '购物'];

export interface POI { name: string; tag: Pref; note: string; lng: number; lat: number }
export interface Destination { name: string; lng: number; lat: number; pois: POI[] }
export interface DayPlan { day: number; stops: POI[] }

// 排序来源（对用户透明）：云脑按你的跨域口味挑 / 端侧真后端挑 / 纯本地命中度兜底。
// 隐私边界：画像只走「云脑」；「端侧」只按旅行偏好不碰画像（profile.ts 注释的硬约束）。
export type PlanMode = '云脑' | '端侧' | '本地';

export interface PlanInput { destName: string; prefs: Pref[]; days: number }
export interface TripPlan { dest: Destination; days: DayPlan[]; mode: PlanMode }

export type OnTravelPhase = (phase: string, detail?: string) => void;   // detail → RunTrace 云/端侧/本地 badge

// A 线（手动存档版 P0，无 OCR）：用户手填一个停留点 → 钉地球。
export type TripMode = 'train' | 'flight' | 'bus' | 'car' | 'walk';
export const TRIP_MODES: { key: TripMode; label: string }[] = [
  { key: 'train', label: '高铁/火车' }, { key: 'flight', label: '飞机' },
  { key: 'bus', label: '大巴' }, { key: 'car', label: '自驾' }, { key: 'walk', label: '步行/其他' },
];
export interface ManualStop { city: string; date?: string; mode?: TripMode; note?: string }

// 稳定 id slug（中文保留，去空格标点）——钉点幂等、可去重、可撤销。
export const slug = (s: string) => (s || '').replace(/[\s·\-—:：,，.。!！?？'"'']/g, '').slice(0, 16);

// ── A 线（截图自动提炼，P1）：端侧 vision 读票据 → 端侧脱敏文本 → 云脑结构化 → TripArchive 多点钉 ──
// 隐私铁律：原图只进端侧 vision（浏览器 WebGPU），永不上云；只有「脱敏后的文本」才喂云脑做结构化。
export interface RawShot { id: string; text: string }   // 一张截图的「脱敏后」OCR/VL 文本（绝不含原图）
export interface Segment { mode?: TripMode; code?: string; date?: string; depTime?: string; fromCity?: string; toCity?: string }
export interface Stay { hotel?: string; city?: string; checkIn?: string; checkOut?: string }
export interface Spot { name?: string; city?: string; date?: string }
export interface TripArchive {
  id: string; title: string; dateStart?: string; dateEnd?: string;
  cities: string[]; segments: Segment[]; stays: Stay[]; spots: Spot[]; confidence: number;
}
export type OnArchivePhase = (phase: string, detail?: string) => void;   // detail → RunTrace badge

// 行程月份 → 季节（回流 seasons 字段用）。
export function seasonOf(date?: string): string | null {
  if (!date) return null;
  const m = Number(String(date).split(/[-/]/)[1]);   // 按分隔符取月份，容忍 '2026-6-15' / '2026/6/15' 非零填充
  if (!m || m < 1 || m > 12) return null;
  return m <= 2 || m === 12 ? '冬' : m <= 5 ? '春' : m <= 8 ? '夏' : '秋';
}
