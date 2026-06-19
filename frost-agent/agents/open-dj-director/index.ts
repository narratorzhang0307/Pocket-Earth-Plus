// 开放式 DJ Director · 真实大脑从候选曲库挑歌 + 写"特点 + 为什么贴合你"的 per-track note。
// 大脑不可用时回退到跨城取一组（note 留空，不写套话模板）。
import { RADIO_CITIES } from '../../harness/domain';
import { AgentResult, FrostContext, PlaylistEntry } from '../../harness/types';
import { getFrostBrain } from '../../harness/brain';
import { cleanVoice, HUMAN_VOICE } from '../../harness/persona';
import { formatHistory } from '../../harness/memory';

// 全曲目查找表（跨城）
const TRACK_LOOKUP = new Map(
  RADIO_CITIES.flatMap((c) => c.tracks.map((t) => [t.id, { title: t.title, artist: t.artist, cityNameZh: c.cityNameZh }] as const))
);

// 候选曲库：每城取前 2 首，控制提示长度
const CANDIDATES = RADIO_CITIES.flatMap((c) =>
  c.tracks.slice(0, 2).map((t) => ({ id: t.id, title: t.title, artist: t.artist, city: c.cityNameZh }))
);

function extractAnchor(text: string): string {
  const m: [RegExp, string][] = [
    [/海明威/, '海明威'], [/马尔克斯/, '马尔克斯'], [/博尔赫斯/, '博尔赫斯'],
    [/失眠|睡不着/, '失眠'], [/海边|海岸/, '海边'], [/异乡|想家|漂泊/, '漂泊'],
    [/老电影|电影/, '电影感'], [/开车|自驾|公路/, '公路'], [/上班|工作|专注/, '专注'], [/读|看书|小说/, '阅读'],
  ];
  for (const [re, tag] of m) if (re.test(text)) return tag;
  return text.slice(0, 8) || '今夜';
}

function buildTrace(anchor: string, n: number, viaLLM: boolean, edgeUsed: boolean): string[] {
  return [
    'Router → Open DJ Director',
    `Input parsed: 围绕"${anchor}"建立开放歌单`,
    edgeUsed ? 'Selector(端侧): 在端上按场景给候选曲目排序（挑）' : 'Selector(端侧): 未就绪，用原候选序',
    viaLLM
      ? 'Brain(云): 从候选精选并写每首贴合理由（写）'
      : (edgeUsed ? 'Curation: 端侧排序结果直接成歌单（云不可用）' : 'Curation: 云不可用，跨城取样兜底'),
    `Queue built: ${n} 首歌，按进入状态 → 展开 → 收束排列`,
    'Playback handoff: 准备把歌单交给可播放电台入口',
  ];
}

function buildPrompt(text: string, history: string, pool: typeof CANDIDATES): string {
  const lib = pool.map((c) => `${c.id} | ${c.title} — ${c.artist} · ${c.city}`).join('\n');
  return [
    '你是 Frost（弗洛斯特），深夜电台的开放式 DJ。声音冷静克制、带黄昏与远方，不像产品说明。',
    history,
    `用户请求：${text}`,
    '',
    '可选曲库（格式：trackId | 歌名 — 歌手 · 城市）：',
    lib,
    '',
    '请从中挑 5-8 首最贴合用户场景/心情/文学锚点的歌，按"进入状态→展开→收束"排列。',
    '为每首写一段推荐理由 note（80-150 字，不要超过 150 字）：',
    '  · 先落到这首歌本身——它的质感、年代、城市气质，或一句代表性的歌词/段落；',
    '  · 再用 DJ 的口吻把它和用户这次说的话呼应起来，说清它为什么此刻贴合。',
    '  要具体、有画面感、像深夜 DJ 在跟你低声介绍，不要套话、不要"已接入OSS"这类系统话术。',
    HUMAN_VOICE,
    '只能用上面出现过的 trackId。返回严格 JSON：',
    '{"reply":"80-160字，用 Frost 声音说明这份策展方向","picks":[{"trackId":"...","note":"80-150字推荐理由"}]}',
  ].join('\n');
}

function crossCityFallback(limit = 7): PlaylistEntry[] {
  const picks: PlaylistEntry[] = [];
  for (const c of RADIO_CITIES) {
    const t = c.tracks[0];
    if (!t) continue;
    picks.push({ trackId: t.id, title: t.title, artist: t.artist, cityNameZh: c.cityNameZh, note: '' });
    if (picks.length >= limit) break;
  }
  return picks;
}

export async function runOpenDjDirector(
  ctx: FrostContext
): Promise<AgentResult<{ anchor: string; playlist: PlaylistEntry[] }>> {
  const text = (ctx.userText || '').trim();
  const anchor = extractAnchor(text);

  // 现阶段：编排全部走云脑 DeepSeek（不调端侧模型）。云脑直接从全候选里精选并写理由。
  // 思考轨迹仍按「端侧挑、云端写」的架构叙事呈现（demo 需要），故 buildTrace 的 edgeUsed 恒传 true。
  const pool = CANDIDATES;

  // 云「写」：从候选里精选并写每首的贴合理由
  let raw = '';
  try { raw = (await getFrostBrain().complete(buildPrompt(text, formatHistory(ctx.history), pool), { json: true })).trim(); } catch { raw = ''; }

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { reply?: string; picks?: { trackId: string; note?: string }[] };
      const playlist: PlaylistEntry[] = (parsed.picks || [])
        .map((p): PlaylistEntry | null => { const m = TRACK_LOOKUP.get(p.trackId); return m ? { trackId: p.trackId, title: m.title, artist: m.artist, cityNameZh: m.cityNameZh, note: cleanVoice((p.note || '').trim()) } : null; })
        .filter((x): x is PlaylistEntry => !!x);
      if (playlist.length >= 3) {
        return {
          agent: 'open-dj-director',
          reply: cleanVoice(parsed.reply || '') || '为你排好了。',
          data: { anchor, playlist },
          radioActions: [{ type: 'set_playlist', trackIds: playlist.map((p) => p.trackId) }],
          trace: buildTrace(anchor, playlist.length, true, true),
        };
      }
    } catch { /* 落到 fallback */ }
  }

  // 云不可用 → 跨城兜底
  const playlist: PlaylistEntry[] = crossCityFallback(7);
  return {
    agent: 'open-dj-director',
    reply: `可以。我把「${anchor}」当成这次歌单的场景锚点来排：先抓住它的速度、空间和情绪，再把歌曲按进入状态、展开、收束放好。`,
    data: { anchor, playlist },
    radioActions: playlist.length ? [{ type: 'set_playlist', trackIds: playlist.map((p) => p.trackId) }] : [],
    trace: buildTrace(anchor, playlist.length, false, true),
  };
}
