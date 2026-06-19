// 行动层：B 线完成行程→多点钉地球+回流画像；A 线（P0 手动录入版）单点钉地球。对齐 photo/movie 的钉点+回流。
import { addUserMark, getUserMarksByKind, spreadCoord } from '../../data/userMarks';
import { geocodeCity } from '../../data/geoStickers';
import { recordSignals } from '../../../../frost-agent/harness/profile';
import { slug, seasonOf, type Destination, type DayPlan, type Pref, type ManualStop, type TripArchive } from './types';

// B 线：完成行程 → 每个停留点钉点（稳定 id 幂等去重）+ 回流（cities/prefs/seasons）。
export function confirmTrip(dest: Destination, days: DayPlan[], prefs: Pref[], date?: string): { added: number } {
  const d = date || new Date().toISOString().slice(0, 10);
  const existing = new Set(getUserMarksByKind('travel').map((m) => m.id));
  let added = 0;
  days.forEach((day) => day.stops.forEach((s) => {
    const id = `utr-${slug(dest.name)}-${slug(s.name)}`;   // 城市+站名 → 稳定可去重可撤销
    if (existing.has(id)) return;
    const [lng, lat] = spreadCoord(id, s.lng, s.lat, 0.04);
    addUserMark({ id, kind: 'travel', lng, lat, label: s.name, meta: { city: dest.name, tag: s.tag, note: s.note, date: d, status: 'done' } });
    existing.add(id); added++;
  }));
  const season = seasonOf(d);
  recordSignals('travel', { cities: [dest.name], prefs: [...prefs], seasons: season ? [season] : [] });   // 旅行口味回流长期画像
  return { added };
}

// A 线 P0（手动录入，无 OCR）：手填 城市+日期+交通 → 钉一个点。geocodeCity 反查坐标，查不到则失败让 UI 提示换写法。
export function pinManualStop(stop: ManualStop): { ok: boolean; reason?: string } {
  const city = (stop.city || '').trim();
  if (!city) return { ok: false, reason: 'needCity' };
  const geo = geocodeCity(city);
  if (!geo) return { ok: false, reason: 'noGeo' };   // 不在城市字典 → 让用户换个写法（中英文）或以后在地图上手点
  const date = stop.date || new Date().toISOString().slice(0, 10);
  const id = `utr-manual-${slug(city)}-${slug(date)}-${stop.mode || 'x'}`;
  const [lng, lat] = spreadCoord(id, geo.lng, geo.lat, 0.04);
  if (getUserMarksByKind('travel').some((m) => m.id === id)) return { ok: true };   // 幂等
  addUserMark({ id, kind: 'travel', lng, lat, label: city, meta: { city, date, mode: stop.mode, note: stop.note || '', status: 'done', manual: true } });
  const season = seasonOf(date);
  recordSignals('travel', { cities: [city], seasons: season ? [season] : [] });
  return { ok: true };
}

// A 线（截图提炼）：TripArchive → 多点钉地球（segment 到达/出发 + stay + spot + 兜底城市点），geocodeCity 反查坐标；
// 原图早弃、只钉脱敏字段。同 tripId 聚合（meta.tripId 留给 P1 连线/整程卡）。回流 cities/seasons。
export function confirmArchive(arc: TripArchive): { added: number; cities: string[] } {
  const existing = new Set(getUserMarksByKind('travel').map((m) => m.id));
  const pinnedCities = new Set<string>();
  let added = 0;
  const pinPoint = (city: string | undefined, label: string, role: string, date?: string, extra?: Record<string, unknown>) => {
    const c = (city || '').trim(); if (!c) return;
    const geo = geocodeCity(c); if (!geo) return;   // 不在城市字典 → 跳过，不瞎钉
    pinnedCities.add(c);   // 城市已覆盖（无论是否新钉）→ 防 cities 兜底重复钉、保证再次调用幂等
    const id = `utr-${slug(arc.id)}-${slug(role)}-${slug(label || c)}`;
    if (existing.has(id)) return;
    const [lng, lat] = spreadCoord(id, geo.lng, geo.lat, 0.04);
    addUserMark({ id, kind: 'travel', lng, lat, label: label || c, meta: { tripId: arc.id, role, city: c, date, status: 'done', ...extra } });
    existing.add(id); added++;
  };
  arc.segments.forEach((s, i) => pinPoint(s.toCity || s.fromCity, s.toCity || s.fromCity || '', `seg${i}`, s.date, { mode: s.mode, code: s.code }));
  arc.stays.forEach((s, i) => pinPoint(s.city, s.hotel || s.city || '', `stay${i}`, s.checkIn, { hotel: s.hotel }));
  arc.spots.forEach((s, i) => pinPoint(s.city, s.name || '', `spot${i}`, s.date));
  arc.cities.forEach((c, i) => { if (!pinnedCities.has((c || '').trim())) pinPoint(c, c, `city${i}`); });   // 未被覆盖的城市补点
  const season = seasonOf(arc.dateStart);
  recordSignals('travel', { cities: [...pinnedCities], seasons: season ? [season] : [] });
  return { added, cities: [...pinnedCities] };
}
