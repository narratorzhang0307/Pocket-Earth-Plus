// 反思层：确定性护栏纠正概率产出 + 应用用户历史纠错。镜像 lib/movie/critic.ts。
import type { BookDraft } from './types';
import { getBookPrefs, type StoredBook } from './store';

const NOW_Y = new Date().getFullYear();

export function applyCritic(d: BookDraft): void {
  d.tags.userRating = Math.max(0, Math.min(5, Math.round(d.tags.userRating || 0)));
  if (d.year != null && (d.year < -800 || d.year > NOW_Y + 1)) { d.year = null; d.reason += '；Critic：年份越界→清空'; }
  if (d.geo && (Math.abs(d.geo.lat) > 90 || Math.abs(d.geo.lng) > 180)) { d.geo = null; d.reason += '；Critic：坐标非法→丢弃'; }
  d.needPlace = !d.geo;
  if (d.tags.plot && d.tags.plot.length > 60) d.tags.plot = d.tags.plot.slice(0, 60);
  if (d.tags.author && d.tags.author.length > 20) d.tags.author = d.tags.author.slice(0, 20);
}

export function applyUserFix(d: BookDraft): void {
  const p = getBookPrefs();
  const pf = p.placeFix[d.id];
  if (pf) { d.geo = { kind: 'story', place: pf.place, lng: pf.lng, lat: pf.lat, confidence: 1 }; d.needPlace = false; d.reason += '；应用你定的落点:' + pf.place; }
  const rf = p.ratingFix[d.id];
  if (typeof rf === 'number') { d.tags.userRating = rf; d.reason += '；应用你定的评分'; }
}

export function mergeKnown(d: BookDraft, known: StoredBook | null): boolean {
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
