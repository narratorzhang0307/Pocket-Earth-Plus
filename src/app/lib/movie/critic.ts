// 反思层：判定前用确定性护栏纠正概率产出（挑错强于一次判对）。
// 钳评分、年份合理性、坐标合法性、剔除明显幻觉、应用用户历史纠错（地点/评分修正）。
import type { MovieDraft } from './types';
import { getMoviePrefs, type StoredMovie } from './store';

const NOW_Y = new Date().getFullYear();

export function applyCritic(d: MovieDraft): void {
  // 评分钳 0-5
  d.tags.userRating = Math.max(0, Math.min(5, Math.round(d.tags.userRating || 0)));
  // 年份合理性（电影诞生 1888 ~ 明年）；越界视为无效
  if (d.year != null && (d.year < 1888 || d.year > NOW_Y + 1)) { d.year = null; d.reason += '；Critic：年份越界→清空'; }
  // 豆瓣分钳 0-10
  if (d.douban != null) d.douban = Math.max(0, Math.min(10, d.douban));
  // 坐标合法性
  if (d.geo && (Math.abs(d.geo.lat) > 90 || Math.abs(d.geo.lng) > 180)) { d.geo = null; d.reason += '；Critic：坐标非法→丢弃'; }
  d.needPlace = !d.geo;
  // 幻觉护栏：演员里去掉过长/含标点的脏串
  d.tags.cast = (d.tags.cast || []).filter((c) => c && c.length <= 12 && !/[，。、;；:：]/.test(c)).slice(0, 4);
  // 剧情长度护栏
  if (d.tags.plot && d.tags.plot.length > 60) d.tags.plot = d.tags.plot.slice(0, 60);
}

// 应用历史纠错：同一片之前被用户改过落点/评分 → 沿用
export function applyUserFix(d: MovieDraft): void {
  const p = getMoviePrefs();
  const pf = p.placeFix[d.id];
  if (pf) { d.geo = { kind: 'filming', place: pf.place, lng: pf.lng, lat: pf.lat, confidence: 1 }; d.needPlace = false; d.reason += '；应用你定的落点:' + pf.place; }
  const rf = p.ratingFix[d.id];
  if (typeof rf === 'number') { d.tags.userRating = rf; d.reason += '；应用你定的评分'; }
}

// 命中本地索引（之前已补全/已钉）→ 复用，省云脑、保持一致
export function mergeKnown(d: MovieDraft, known: StoredMovie | null): boolean {
  if (!known) return false;
  d.tags = { ...known.tags, userRating: d.tags.userRating || known.tags.userRating };
  if (!d.geo && known.geo) d.geo = known.geo;
  if (d.year == null) d.year = known.year;
  if (!d.country) d.country = known.country;
  d.needPlace = !d.geo;
  d.reason += '；命中本地索引（已补全过）';
  d.source = 'mixed';
  return known.enriched;
}
