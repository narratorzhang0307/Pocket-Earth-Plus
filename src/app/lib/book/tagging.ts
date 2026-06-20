// 协作·子 agent 层：①补全子 agent（云脑 JSON：作者/译者/类型/流派/剧情 + 故事地/作者地）
// ②地理子 agent（故事地→作者地→国家，逐级 geocode，经 resolvePlace：本地表→Mapbox 全球）。镜像 lib/movie/tagging.ts。
import { resolvePlace } from '../skills/resolvePlace';
import { bookCountry } from '../../data/books';
import type { GeoTarget } from './types';

export interface EnrichRaw {
  author: string;
  translator: string;
  genre: string;
  movement: string;
  plot: string;
  country: string;
  year: number | null;
  storyPlace: string;    // 故事主要发生城市（不确定留空）
  authorPlace: string;   // 作者出身/写作城市（不确定留空）
}
const EMPTY: EnrichRaw = { author: '', translator: '', genre: '', movement: '', plot: '', country: '', year: null, storyPlace: '', authorPlace: '' };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });
}
function extractJSON(text: string): unknown | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const s = body.indexOf('{'); const e = body.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(body.slice(s, e + 1)); } catch { return null; }
}
const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');

export async function enrichTags(title: string, hint?: { author?: string; country?: string; year?: number | null }): Promise<{ raw: EnrichRaw; ok: boolean }> {
  const system = '你是图书馆资料员。根据书名给出结构化标签，只输出一个 JSON 对象，不要任何解释或代码块标记。'
    + '字段：author(作者,字符串)、translator(译者,字符串,无或原文写作就空)、genre(类型,如 小说/非虚构/诗歌/历史/科幻，单个)、'
    + 'movement(流派或文学运动,如 魔幻现实主义/意识流/垮掉的一代，没有就空字符串)、plot(一句话主题或剧情,不超过40字)、'
    + 'country(作者国籍,中文)、year(成书年份,数字或null)、'
    + 'storyPlace(故事主要发生城市,中文,不确定就空字符串)、authorPlace(作者出身或写作城市,中文,不确定就空字符串)。'
    + '重要：不确定的字段一律留空字符串或 null，绝对不要编造。';
  const hintStr = hint ? `已知线索（可纠正/补充）：作者=${hint.author || '?'}，国籍=${hint.country || '?'}，年份=${hint.year || '?'}。` : '';
  const prompt = `书名：《${title}》。${hintStr}请输出 JSON。`;
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
        author: str(obj.author), translator: str(obj.translator), genre: str(obj.genre), movement: str(obj.movement),
        plot: str(obj.plot).slice(0, 60), country: str(obj.country), year: yearN,
        storyPlace: str(obj.storyPlace), authorPlace: str(obj.authorPlace),
      }, ok: true,
    };
  } catch { return { raw: EMPTY, ok: false }; }
}

// 地理子 agent：故事地 > 作者地 > 国家（经 [resolvePlace]：本地表命中即返回、未命中走 Mapbox 拿全球）
export async function geoResolve(opts: { storyPlace?: string; authorPlace?: string; country?: string }): Promise<GeoTarget | null> {
  const story = opts.storyPlace ? await resolvePlace(opts.storyPlace) : null;
  if (story) return { kind: 'story', place: story.place, lng: story.lng, lat: story.lat, confidence: story.source === 'local' ? 0.9 : 0.82 };
  const author = opts.authorPlace ? await resolvePlace(opts.authorPlace) : null;
  if (author) return { kind: 'author', place: author.place, lng: author.lng, lat: author.lat, confidence: author.source === 'local' ? 0.75 : 0.7 };
  if (opts.country) {
    const c = bookCountry(opts.country);
    if (c) return { kind: 'country', place: opts.country, lng: c[0], lat: c[1], confidence: 0.5 };
  }
  return null;
}
