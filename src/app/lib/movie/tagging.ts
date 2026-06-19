// 协作·子 agent 层：两个运行时子 agent。
// ① 补全子 agent：一次云脑（/api/frost-llm, json）强约束 JSON，出 导演/演员/类型/流派/剧情 + 取景地/故事地 + 补国家年份。
//    系统提示明确「不确定留空、禁编演员」——把幻觉压在 critic 护栏之前。
// ② 地理子 agent：纯端上，取景地→故事地→国家逐级 geocode，返回 GeoTarget{kind} 让 UI 显示落点精度。
import { geocodeCity } from '../../data/geoStickers';
import { movieCountry } from '../../data/movies';
import type { GeoTarget } from './types';

// 云脑补全子 agent 的原始产出（全部可缺，缺则空）
export interface EnrichRaw {
  director: string;
  cast: string[];
  genre: string;
  movement: string;
  plot: string;
  country: string;
  year: number | null;
  filmingPlace: string;   // 主要取景城市（不确定留空）
  storyPlace: string;     // 故事发生城市（不确定留空）
}
const EMPTY: EnrichRaw = { director: '', cast: [], genre: '', movement: '', plot: '', country: '', year: null, filmingPlace: '', storyPlace: '' };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });
}

// 从 LLM 文本里抠出第一个 JSON 对象（容忍 ```json 包裹与前后废话）
function extractJSON(text: string): unknown | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const s = body.indexOf('{'); const e = body.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(body.slice(s, e + 1)); } catch { return null; }
}

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
const strArr = (x: unknown) => Array.isArray(x) ? x.map(str).filter(Boolean).slice(0, 5) : (typeof x === 'string' && x ? x.split(/[、,，/]/).map((s) => s.trim()).filter(Boolean).slice(0, 5) : []);

// 补全子 agent：调用云脑，强约束 JSON。失败 → 返回 EMPTY（舱壁：单级失败不抛错，交回 resolve 走下一级兜底）。
export async function enrichTags(title: string, hint?: { director?: string; country?: string; year?: number | null }): Promise<{ raw: EnrichRaw; ok: boolean }> {
  const system = '你是电影资料员。根据片名给出结构化标签，只输出一个 JSON 对象，不要任何解释或代码块标记。'
    + '字段：director(导演,字符串)、cast(主演,字符串数组最多4个)、genre(主类型,如 剧情/科幻/爱情，单个)、'
    + 'movement(流派或电影运动,如 法国新浪潮/作者电影/黑色电影，没有就空字符串)、plot(一句话剧情，不超过40字)、'
    + 'country(主要出品国家/地区,中文)、year(上映年份,数字或null)、'
    + 'filmingPlace(主要取景城市,中文,不确定就空字符串)、storyPlace(故事发生城市,中文,不确定就空字符串)。'
    + '重要：不确定的字段一律留空字符串或空数组，绝对不要编造演员或地点。';
  const hintStr = hint ? `已知线索（可纠正/补充）：导演=${hint.director || '?'}，国家=${hint.country || '?'}，年份=${hint.year || '?'}。` : '';
  const prompt = `片名：《${title}》。${hintStr}请输出 JSON。`;
  try {
    const r = await withTimeout(fetch('/api/frost-llm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, system, json: true }),
    }), 20000);
    const data = await r.json();
    const obj = extractJSON(String(data?.text || '')) as Record<string, unknown> | null;
    if (!obj) return { raw: EMPTY, ok: false };
    const yearN = typeof obj.year === 'number' ? obj.year : (typeof obj.year === 'string' && /^\d{4}$/.test(obj.year) ? +obj.year : null);
    return {
      raw: {
        director: str(obj.director), cast: strArr(obj.cast), genre: str(obj.genre), movement: str(obj.movement),
        plot: str(obj.plot).slice(0, 60), country: str(obj.country), year: yearN,
        filmingPlace: str(obj.filmingPlace), storyPlace: str(obj.storyPlace),
      }, ok: true,
    };
  } catch { return { raw: EMPTY, ok: false }; }
}

// 地理子 agent：取景地 > 故事地 > 国家，逐级落坐标。纯本地，不联网。
export function geoResolve(opts: { filmingPlace?: string; storyPlace?: string; country?: string }): GeoTarget | null {
  const film = opts.filmingPlace ? geocodeCity(opts.filmingPlace) : null;
  if (film) return { kind: 'filming', place: film.place, lng: film.lng, lat: film.lat, confidence: 0.9 };
  const story = opts.storyPlace ? geocodeCity(opts.storyPlace) : null;
  if (story) return { kind: 'story', place: story.place, lng: story.lng, lat: story.lat, confidence: 0.75 };
  if (opts.country) {
    const c = movieCountry(opts.country);
    if (c) return { kind: 'country', place: opts.country, lng: c[0], lat: c[1], confidence: 0.5 };
  }
  return null;
}
