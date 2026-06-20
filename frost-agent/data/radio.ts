// ─────────────────────────────────────────────────────────────
// 电台 · 数据驱动
// 城市数据来自本地资源库（resource-library/，不在仓库内）。
// 资料库新增城市 / 改数据 → import.meta.glob 自动收录 → UI 自动更新。
// 仓库内无资料库时（纯代码 clone），glob 返回空，电台列表为空，构建照常通过。
// 音频与封面均为公开 OSS 直链，前端直接播放，无需后端。
// ─────────────────────────────────────────────────────────────

export interface RadioTrack {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  audioUrl: string;       // 歌曲音频
  introText: string;      // DJ 介绍这首歌的解说词
  introAudioUrl: string;  // DJ 解说音频
  // 跨城歌单专用：每首歌带自己城市的封面/名/时区，让电台头与封面随歌联动。
  // 普通城市电台留空，回退到所属城市。
  cityNameZh?: string;
  cityName?: string;
  cover?: string;
  ianaTz?: string | null;
  tzOffset?: number;
}

export interface PodcastSegment {
  id: string;
  title: string;
  subtitle: string;       // 城市 / 作家
  text: string;           // 播客文稿
  audioUrl: string;
}

export interface RadioCity {
  slug: string;
  cityName: string;
  cityNameZh: string;
  ianaTz: string | null;  // 有则用 Intl 精确算当地时间
  tzOffset: number;       // 退化方案：按时区偏移粗算
  station: { freq: number; name: string };
  cover: string;          // 城市封面（OSS）
  tracks: RadioTrack[];
  podcast: PodcastSegment[]; // 没有播客 TTS 的城市为空数组 → UI 不显示「播客」
  lat?: number;           // 地球红点坐标（来自 city-meta，缺失则不在地球上画点）
  lng?: number;
  description?: string;    // 一句城市描述（红点 hover 展示）
}

const modules = import.meta.glob<{ default: RadioCity }>(
  '../../resource-library/cities/*.json',
  { eager: true }
);

// 城市坐标 + 一句描述（gitignore 的私有 meta；纯代码 clone 时缺失 → 返回空，地球上不画红点）。
interface CityMeta { lat: number; lng: number; description: string }
const metaModules = import.meta.glob<{ default: Record<string, CityMeta> }>(
  '../../resource-library/city-meta.json',
  { eager: true }
);
const CITY_META: Record<string, CityMeta> = Object.values(metaModules)[0]?.default ?? {};

// 清掉标题首尾残缺/多余的书名号与引号（部分数据是 "《看见爱" 这种只有半边的脏数据）
function cleanTitle(s: string): string {
  const out = (s || '').replace(/^[《「『﹝]+/, '').replace(/[》」』﹞]+$/, '').trim();
  return out || s;
}

// 西→东按时区排序（洛杉矶在前），同偏移按城市名
export const RADIO_CITIES: RadioCity[] = Object.values(modules)
  .map((m) => m.default)
  .map((c) => {
    const meta = CITY_META[c.cityNameZh];
    return {
      ...c,
      tracks: c.tracks.map((t) => ({ ...t, title: cleanTitle(t.title) })),
      lat: meta?.lat,
      lng: meta?.lng,
      description: meta?.description || undefined,
    };
  })
  .sort((a, b) => a.tzOffset - b.tzOffset || a.cityNameZh.localeCompare(b.cityNameZh, 'zh'));

/** 解析后的可播放曲目（跨城歌单用：含音频、封面、DJ 解说稿）。 */
export interface ResolvedTrack {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  cover: string;
  cityNameZh: string;
  cityName: string;
  ianaTz: string | null;
  tzOffset: number;
  introText: string;       // DJ 介绍这首歌的解说稿（打字机用）
  introAudioUrl: string;
}

const _trackIndex = new Map<string, ResolvedTrack>();
for (const c of RADIO_CITIES) {
  for (const t of c.tracks) {
    if (!_trackIndex.has(t.id)) {
      _trackIndex.set(t.id, { id: t.id, title: t.title, artist: t.artist, audioUrl: t.audioUrl, cover: c.cover, cityNameZh: c.cityNameZh, cityName: c.cityName, ianaTz: c.ianaTz, tzOffset: c.tzOffset, introText: t.introText, introAudioUrl: t.introAudioUrl });
    }
  }
}

/** 按 trackId 跨城解析成可播放曲目（Frost 歌单 → 电台播放）。 */
export function resolveTracksByIds(ids: string[]): ResolvedTrack[] {
  return ids.map((id) => _trackIndex.get(id)).filter((t): t is ResolvedTrack => !!t);
}

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 城市当地 hh:mm：优先 IANA 时区，退化到固定偏移。 */
export function cityClock(date: Date, city: { ianaTz: string | null; tzOffset: number }): string {
  if (city.ianaTz) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: city.ianaTz, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(date);
    } catch { /* fall through */ }
  }
  const d = new Date(date.getTime() + city.tzOffset * 3600000);
  return d.toISOString().substr(11, 5);
}

/** 主持人开场白：北京时间 + 城市当地时间（纯时间计算，非 AI）。 */
export function frostOpening(date: Date, city: RadioCity): string {
  let bj = '';
  try {
    bj = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  } catch { bj = ''; }
  const local = cityClock(date, city);
  return `现在是北京时间 ${bj}，${city.cityNameZh}当地时间 ${local}，正在经历日落。我是弗洛斯特。`;
}
