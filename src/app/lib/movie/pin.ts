// 行动层：suggest-then-confirm。draft 只是建议，用户确认才落地——绝不自动钉。
// 写进共享落点总线 userMarks(kind:'movie')：全标签进 meta（地球详情/票根都读它）+ 喂长期画像 + 落本地索引（幂等）。
import { addUserMark, getUserMarksByKind, removeUserMark, spreadCoord } from '../../data/userMarks';
import { recordSignals } from '../../../../frost-agent/harness/profile';
import type { MovieDraft } from './types';
import { putMovie } from './store';

const PREFIX = 'umv-';   // userMarks 里电影钉的 id 前缀

// 该片是否已钉（按归一片名主键判，避免重复落点）
export function alreadyPinned(draft: MovieDraft): boolean {
  const want = PREFIX + draft.id;
  return getUserMarksByKind('movie').some((m) => m.id === want);
}

// 确认钉地球：写 userMarks（全标签 meta）+ 画像 + 索引。无坐标的不钉（needPlace），返回 false。
export async function confirmPin(draft: MovieDraft): Promise<{ pinned: boolean; reason?: string }> {
  if (!draft.geo) return { pinned: false, reason: 'needPlace' };
  const id = PREFIX + draft.id;
  if (alreadyPinned(draft)) { await persist(draft, true); return { pinned: true, reason: 'exists' }; }
  const [lng, lat] = spreadCoord(id, draft.geo.lng, draft.geo.lat);
  addUserMark({
    id, kind: 'movie', lng, lat, label: draft.title,
    meta: {
      title: draft.title, original: draft.original, director: draft.tags.director,
      cast: draft.tags.cast, genre: draft.tags.genre, movement: draft.tags.movement,
      plot: draft.tags.plot, synopsis: draft.tags.plot, country: draft.country, year: draft.year,
      rating: draft.tags.userRating, douban: draft.douban, type: draft.tags.genre || '电影',
      date: draft.date, place: draft.geo.place, geoKind: draft.geo.kind,
    },
  });
  // 增量喂长期画像（回流公开创作标签：国别/导演/类型+流派；故意不回流 cast 演员表，避免画像变社交图谱）。
  // 按你手定的真实星级加权：5★ 权重×3、4★×2、其余×1 —— 你越爱的片，其导演/类型在画像里分量越重。
  const w = draft.tags.userRating >= 5 ? 3 : draft.tags.userRating >= 4 ? 2 : 1;
  const rep = (arr: string[]) => arr.flatMap((x) => Array(w).fill(x) as string[]);
  recordSignals('movies', {
    countries: draft.country ? rep([draft.country]) : [],
    directors: draft.tags.director ? rep([draft.tags.director]) : [],
    genres: rep([draft.tags.genre, draft.tags.movement].filter(Boolean) as string[]),
  });
  await persist(draft, true);
  return { pinned: true };
}

// 不钉、仅存档（无坐标或用户暂不钉）：进本地索引，下次重跑直接命中
export async function archiveOnly(draft: MovieDraft): Promise<void> { await persist(draft, false); }

async function persist(draft: MovieDraft, pinned: boolean): Promise<void> {
  await putMovie({
    key: draft.id, title: draft.title, country: draft.country, year: draft.year,
    // enriched 只在云脑确实补全过时为 true（'llm'/'mixed'）。纯本地命中('catalog')标签稀疏，
    // 不能记 enriched:true——否则重跑命中索引会永久跳过云脑补全，标签永远补不全（缓存中毒）。
    tags: draft.tags, geo: draft.geo, pinned, enriched: draft.source === 'llm' || draft.source === 'mixed',
    ts: Date.now(),
  });
}

export function unpin(draft: MovieDraft): void { removeUserMark(PREFIX + draft.id); }
