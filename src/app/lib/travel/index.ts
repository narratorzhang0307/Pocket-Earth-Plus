// 行程整理 agent · 解耦模块公共出口（六层架构）。详见 旅行 Agent/00-架构总纲.md。
export type {
  Pref, POI, Destination, DayPlan, PlanMode, PlanInput, TripPlan, OnTravelPhase, TripMode, ManualStop,
  RawShot, Segment, Stay, Spot, TripArchive, OnArchivePhase,
} from './types';
export { PREFERENCES, TRIP_MODES, slug, seasonOf } from './types';
export { DESTINATIONS, destination } from './catalog';
export { planTrip, rankPOIs, cloudRankPOIs } from './plan';
export { runPlan, confirmTrip, pinManualStop, runArchive, confirmArchive } from './agent';

import type { PlanMode } from './types';
// 给 UI：排序来源的中文说明 + 颜色（云脑=按你跨域口味挑、端侧=本地真后端挑、本地=偏好命中度兜底）
export const MODE_LABEL: Record<PlanMode, string> = { 云脑: '按你的口味挑', 端侧: '端侧按偏好挑', 本地: '本地按偏好挑' };
export const MODE_COLOR: Record<PlanMode, string> = { 云脑: '#0a7d4a', 端侧: '#c08a00', 本地: '#8a6d3b' };
