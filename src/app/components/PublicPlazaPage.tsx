import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Users, Moon, FileText, Star, Check, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { getProfile, profileFingerprint, summarizeTaste } from '../../../frost-agent/harness/profile';
import { getFrostBrain } from '../../../frost-agent/harness/brain';
import FrostBuddy from './FrostBuddy';
import type { FrostTheme } from '../../../frost-agent/buddy/themes';

// public-plaza —— agent 代理社交 · 公共广场（前瞻接口）
// 叙事：你白天上班，把自己的 frost-agent 委派到 agent 公共广场。它带着你的长期口味画像出门，
// 在广场上遇见口味相近的人，夜里回来给你一份报告，由你决定要不要进一步了解。
// 现在还没有真实的「其他用户」数据源，所以广场里遇见的人是用你本机画像的 top 标签现场生成的示意，
// 用来把「代理社交」这条 UGC 生态成熟后的可能性先做成可看可点的界面。

interface Props { onBack: () => void }
const ACCENT = '#6b7a8f'; // 克制的石板蓝灰，避开 7 个已用主题色

const FIELD_LABEL: Record<string, string> = {
  directors: '同看导演', countries: '同好国别', authors: '同读作者', storyPlaces: '同一个故事地',
  artists: '同听艺人', genres: '同一种流派', moods: '同一种情绪', cities: '走过同一座城', aesthetics: '同一种风格',
};
// 共享兴趣 → FROST 换装主题：广场里遇见的人，穿着「你俩共同兴趣」的装（戴耳机/捧书/背包…）
const FIELD_THEME: Record<string, FrostTheme> = {
  genres: 'music', artists: 'music', directors: 'movie', countries: 'movie',
  authors: 'book', storyPlaces: 'book', cities: 'travel', moods: 'mood', aesthetics: 'culture',
};
// 别人的 FROST 特使配色（中深色，浅底上看得清；按 tag 哈希确定性分配，每个人一种色）
const PALETTE = ['#1d3e57', '#7a4dd6', '#0a7d4a', '#b06a00', '#b03a5b', '#2a6f8f', '#6b4f9e', '#3a7d5e'];
const ALIASES = ['北纬三十度的旅人', '深夜放映员', '末班地铁上的人', '海边的读者', '胶片收集者', '城市慢游者', '黑胶整理员', '清晨写信的人', '旧书店常客', '边走边听的人', '屋顶看云的人', '地图上的标记者'];
const BLURBS = ['也常一个人看完午夜场', '把通勤路线走成了散步', '手机里存着没发出去的照片', '偏爱下雨天和长段落', '在收集各地的车票门票', '会把喜欢的歌单循环到天亮', '总坐同一家咖啡馆靠窗的位置', '给每座去过的城市写一句话', '习惯走路时绕远一点', '睡前要翻几页才安心'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

interface Neighbor { tag: string; field: string; alias: string; blurb: string; sim: number; color: string; theme: FrostTheme }

export default function PublicPlazaPage({ onBack }: Props) {
  const [taste, setTaste] = useState('');
  const [phase, setPhase] = useState<'day' | 'night'>('day');
  const [decided, setDecided] = useState<Record<string, 'yes' | 'no'>>({});
  // 夜间报告：FROST 叙事复盘 + 每个聊得来的人替你捎回的一句推荐（云 Qwen 生成，带兜底）
  const [night, setNight] = useState<{ recap: string; gifts: Record<string, string> } | null>(null);
  const [nightLoading, setNightLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    summarizeTaste(getFrostBrain()).then((t) => { if (alive && t) setTaste(t); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // 用本机画像的 top 标签现场生成「广场上遇见的相似的人」——共同点是真的来自你的口味
  const { neighbors, myTags } = useMemo(() => {
    const p = getProfile();
    const fp = profileFingerprint();
    const flat: { tag: string; field: string; n: number }[] = [];
    for (const fields of Object.values(p.domains))
      for (const [field, list] of Object.entries(fields))
        for (const tc of (list || []).slice(0, 3)) flat.push({ tag: tc.tag, field, n: tc.n });
    flat.sort((a, b) => b.n - a.n);
    const seen = new Set<string>(); const top: typeof flat = [];
    for (const f of flat) { if (seen.has(f.tag)) continue; seen.add(f.tag); top.push(f); if (top.length >= 6) break; }
    // 确定性去重分配：别名 / blurb 不重样（线性探测）
    const usedA = new Set<number>(); const usedB = new Set<number>();
    const pick = (base: number, len: number, used: Set<number>) => { let i = base % len; while (used.has(i)) i = (i + 1) % len; used.add(i); return i; };
    const neighbors: Neighbor[] = top.map((t) => {
      const h = hash(t.tag + '·' + fp);
      return {
        tag: t.tag, field: t.field,
        alias: ALIASES[pick(h, ALIASES.length, usedA)],
        blurb: BLURBS[pick(h >> 5, BLURBS.length, usedB)],
        sim: 72 + (h % 26), // 72–97%
        color: PALETTE[h % PALETTE.length],
        theme: FIELD_THEME[t.field] || 'none',
      };
    }).sort((a, b) => b.sim - a.sim);
    return { neighbors, myTags: top.slice(0, 5).map((t) => t.tag) };
  }, []);

  const matches = neighbors.filter((n) => n.sim >= 85);
  const report = matches.length ? matches : neighbors.slice(0, 2);

  // 进夜间模式 → FROST 归来复盘：一次云 Qwen 调用，产出叙事 recap + 每人捎回的一句推荐；失败走模板兜底。
  useEffect(() => {
    if (phase !== 'night' || night || nightLoading || !report.length) return;
    setNightLoading(true);
    const list = report.map((n) => `${n.alias}（${FIELD_LABEL[n.field] || n.field}「${n.tag}」）`).join('；');
    const prompt =
      `你是用户的社交特使 FROST，今天替 ta 去 agent 公共广场社交。ta 的口味：${taste || myTags.join('、')}。\n` +
      `今天和这几个口味相近的人聊得来：${list}。\n` +
      `以 FROST 的口吻（温和、第一人称「我」、≤55字）写一句今晚归来的复盘；再为每个人写一句「我替你向 ta 打听到的、你大概会喜欢的东西」——结合你俩的共同点，给一个具体的歌 / 电影 / 书 / 地方名 + 半句理由（≤25字）。\n` +
      `只输出 JSON：{"recap":"...","gifts":[{"alias":"人名","gift":"..."}]}`;
    let cancelled = false;
    (async () => {
      let raw = '';
      try { raw = (await getFrostBrain().complete(prompt, { json: true })) || ''; } catch { raw = ''; }
      const gifts: Record<string, string> = {};
      let recap = '';
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        const obj = JSON.parse(m ? m[0] : raw);
        recap = (obj.recap || '').toString();
        for (const g of (obj.gifts || [])) if (g && g.alias) gifts[g.alias] = (g.gift || '').toString();
      } catch { /* 走兜底 */ }
      if (!recap) recap = `今晚我在广场转了一圈，遇见 ${neighbors.length} 个人，和其中 ${report.length} 个聊得来。`;
      report.forEach((n) => { if (!gifts[n.alias]) gifts[n.alias] = `ta 也喜欢「${n.tag}」，说你大概会想试试。`; });
      if (!cancelled) { setNight({ recap, gifts }); setNightLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="h-full flex flex-col font-sans overflow-hidden" style={{ background: phase === 'night' ? '#dde2ea' : '#EAEAEA', transition: 'background .6s ease' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">PUBLIC-PLAZA</div>
          <div className="text-[9px] text-black/45 leading-tight mt-0.5">agent 代理社交 · 公共广场</div>
        </div>
        <Users className="w-4 h-4" strokeWidth={2.5} style={{ color: ACCENT }} />
      </div>

      {/* Stat strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black shrink-0" style={{ color: ACCENT }}>
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>在场 {neighbors.length}</span><span className="opacity-40">|</span>
          <span>夜间匹配 {report.length}</span><span className="opacity-40">|</span>
          <span>前瞻 · UGC</span>
        </div>
      </div>

      {/* 你的特使（带画像出门） */}
      <div className="px-3 pt-3 shrink-0">
        <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
          <div className="flex items-start gap-3">
            {/* 你的特使：活的 FROST 线条形象。白天轮换装束（外出社交中），夜间安静发光归来 */}
            <div className="shrink-0 flex items-center justify-center overflow-hidden"
              style={{ width: 86, height: 74, border: '2px solid #000', background: '#fff' }}>
              <FrostBuddy state="idle" cycle={phase === 'day'} color="#1d3e57" glow={false} size={10} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-pixel text-[9px] tracking-wide">你的特使 · FROST</span>
                <span className="ml-auto font-pixel text-[7px] uppercase tracking-wider border border-black px-1.5 py-0.5 text-white" style={{ background: ACCENT }}>
                  {phase === 'day' ? '白天 · 外出社交中' : '夜间 · 已回来'}
                </span>
              </div>
              <div className="text-[10.5px] text-black/70 leading-snug">
                白天你上班，它替你去广场，带着你的长期口味画像遇见相近的人。
              </div>
              {taste && <div className="text-[10px] text-black/55 leading-snug mt-1">◍ 它带出的名片 · {taste}</div>}
            </div>
          </div>
          {myTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {myTags.map((t) => (
                <span key={t} className="text-[9px] border border-black px-1.5 py-0.5 bg-[#EAEAEA] tracking-wide">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 白天 / 夜间 切换 */}
      <div className="px-3 pt-2.5 pb-1 shrink-0">
        <div className="grid grid-cols-2 gap-2">
          {(['day', 'night'] as const).map((ph) => (
            <button key={ph} onClick={() => setPhase(ph)}
              className={`flex items-center justify-center gap-1.5 border-2 border-black py-1.5 font-pixel text-[8px] uppercase tracking-wider active:translate-y-px ${phase === ph ? 'text-white shadow-[1px_1px_0_#000]' : 'bg-white text-black'}`}
              style={phase === ph ? { background: ACCENT } : undefined}>
              {ph === 'day' ? <Users className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Moon className="w-3.5 h-3.5" strokeWidth={2.5} />}
              {ph === 'day' ? '广场 · 此刻在场' : '夜间 · 回来报告'}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5">
        {neighbors.length === 0 && (
          <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_rgba(0,0,0,0.85)] text-center">
            <Users className="w-6 h-6 mx-auto mb-2" strokeWidth={2} style={{ color: ACCENT }} />
            <div className="text-[12px] font-bold mb-1">画像还太薄</div>
            <div className="text-[11px] text-black/55 leading-snug">先去看几部电影、读几本书、整理些照片，你的特使才有名片可带出门。</div>
          </div>
        )}

        {phase === 'day' && neighbors.map((n, i) => (
          <motion.div key={n.tag} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="flex items-center gap-2.5">
              {/* 别人的 FROST 特使：穿着你俩共同兴趣的装、各自配色 */}
              <div className="shrink-0 flex items-center justify-center overflow-hidden" style={{ width: 42, height: 42, border: '2px solid #000', background: '#fff' }}>
                <FrostBuddy state="idle" theme={n.theme} color={n.color} glow={false} size={6} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold truncate" style={{ color: n.color }}>{n.alias}</div>
                <div className="text-[10px] text-black/55 leading-tight truncate">{n.blurb}</div>
              </div>
              <div className="shrink-0 flex items-center gap-1 font-pixel text-[8px]" style={{ color: n.color }}>
                <Star className="w-3 h-3" strokeWidth={2.5} />{n.sim}%
              </div>
            </div>
            <div className="mt-2 text-[10px] tracking-wide border border-black bg-[#EAEAEA] px-2 py-1 inline-block">
              共同点 · {FIELD_LABEL[n.field] || n.field} {n.tag}
            </div>
          </motion.div>
        ))}

        {phase === 'night' && (
          <>
            <div className="flex items-center gap-1.5 px-0.5">
              <FileText className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: ACCENT }} />
              <span className="font-pixel text-[8px] tracking-widest text-black/60">今晚的报告 · 由你决定</span>
            </div>

            {/* FROST 归来复盘（叙事 · 白底黑线，简洁干净） */}
            <div className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)] flex items-start gap-2.5">
              <div className="shrink-0 flex items-center justify-center overflow-hidden" style={{ width: 54, height: 52, border: '2px solid #000', background: '#fff' }}>
                <FrostBuddy state="idle" color="#1d3e57" glow={false} size={7} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="font-pixel text-[7px] tracking-widest mb-1" style={{ color: ACCENT }}>◍ FROST · 今晚归来</div>
                <div className="text-[11px] leading-snug text-black/75">
                  {nightLoading && !night ? '正在整理今天的见闻…' : (night?.recap || '今晚没遇到特别投缘的人。')}
                </div>
              </div>
            </div>
            {report.map((n, i) => {
              const d = decided[n.tag];
              return (
                <motion.div key={n.tag} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div className="shrink-0 flex items-center justify-center overflow-hidden" style={{ width: 42, height: 42, border: '2px solid #000', background: '#fff' }}>
                      <FrostBuddy state="idle" theme={n.theme} color={n.color} glow={false} size={6} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold truncate" style={{ color: n.color }}>{n.alias}</div>
                      <div className="text-[10px] text-black/55 leading-tight">{FIELD_LABEL[n.field] || n.field} {n.tag} · 契合 {n.sim}%</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-black/75 leading-snug mb-2 border-l-2 pl-2" style={{ borderColor: n.color }}>
                    <span className="font-bold" style={{ color: n.color }}>◍ ta 替你捎回 · </span>
                    {night?.gifts[n.alias] || (nightLoading ? '…' : `ta 也喜欢「${n.tag}」，说你大概会想试试。`)}
                  </div>
                  {d ? (
                    <div className="flex items-center gap-1.5 font-pixel text-[8px] tracking-wide" style={{ color: d === 'yes' ? ACCENT : '#999' }}>
                      {d === 'yes' ? <><Check className="w-3.5 h-3.5" strokeWidth={3} />已让特使去打个招呼</> : <><Clock className="w-3.5 h-3.5" strokeWidth={2.5} />先放一放</>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setDecided((s) => ({ ...s, [n.tag]: 'yes' }))}
                        className="border-2 border-black py-1.5 font-pixel text-[8px] uppercase tracking-wider text-white shadow-[1px_1px_0_#000] active:translate-y-px" style={{ background: ACCENT }}>
                        进一步了解
                      </button>
                      <button onClick={() => setDecided((s) => ({ ...s, [n.tag]: 'no' }))}
                        className="border-2 border-black py-1.5 font-pixel text-[8px] uppercase tracking-wider bg-white active:translate-y-px">
                        暂不
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </>
        )}

        <div className="text-center text-[8px] font-pixel text-black/30 py-1.5 tracking-widest leading-relaxed">
          前瞻接口 · 真实匹配需 UGC 生态成熟<br />广场里遇见的人由你本机画像生成 · 主动权始终在你
        </div>
      </div>
    </div>
  );
}
