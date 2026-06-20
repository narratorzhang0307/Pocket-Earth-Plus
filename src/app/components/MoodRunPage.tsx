import { useReducer, useState, useEffect, useMemo } from 'react';
import { ChevronLeft, MapPin, X } from 'lucide-react';
import { getMoodStickers, addMoodSticker, removeMoodSticker, subscribeMood, analyzeMood, randomPlace, detectToneLocal, MOOD_TONES, type MoodSticker, pickRot } from '../data/geoStickers';
import { groupMoodsByTimeline, toneDistribution, moodSummary, dayKey } from '../lib/mood/retrospect';
import { ensureHeavyMarkers } from '../data/mapMarkers';
import { nearbyMarks, kindEmoji } from '../lib/marks/nearby';

// mood-curator 运行页 —— 心绪 · 漫游。
// 记录你在世界各地「赛博浏览」时的心情：写一句 → 云脑判「地点 + 情绪」→ 情绪给颜色、钉到对应经纬度。
// 「列表 / 回望」双视图：回望 = 六色情绪分布 + 时间线分组，看得见心情如何累积。

interface Props { onBack: () => void }
const ACCENT = '#ffd23b';

export default function MoodRunPage({ onBack }: Props) {
  const [tick, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeMood(force), []);
  useEffect(() => { ensureHeavyMarkers().catch(() => {}); }, []);   // 让「这一带」也能看到电影/书标记（懒加载）
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'list' | 'retrospect'>('list');
  // 记一笔后「这一带」：只存落点(suggest)，nearby 实时派生 —— 删掉附近某个标记会自动从卡里消失，不残留陈旧 chip
  const [pinned, setPinned] = useState<{ lat: number; lng: number; place: string; excludeId: string } | null>(null);

  const stickers = getMoodStickers();
  const cities = new Set(stickers.map((s) => s.place)).size;
  const summary = moodSummary(stickers);   // 回望概览（仅统计有情绪基调的真心情贴）
  // tick 随 subscribeMood 变化（增删心情都会触发）→ nearby 自动重算，不残留已删标记
  const nearby = useMemo(() => (pinned ? nearbyMarks(pinned.lat, pinned.lng, { excludeId: pinned.excludeId }) : []), [pinned, tick]);

  // 钉下：云脑一次判「地点 + 情绪」→ 情绪决定颜色、地名决定落点；判不出地名落「此处」(当前中心)
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await analyzeMood(t, [120.14, 30.24]);
    const id = 'mood-' + Date.now();
    addMoodSticker({ id, lat: r.lat, lng: r.lng, text: t, place: r.place, color: MOOD_TONES[r.tone].color, rot: pickRot(id), tone: r.tone });
    setPinned({ lat: r.lat, lng: r.lng, place: r.place, excludeId: id });
    setText(''); setBusy(false);
  };

  // 随机漫游：用户主动把心情甩到地球某处（情绪仍由本地词典即时判，给颜色）
  const submitRandom = () => {
    const t = text.trim();
    if (!t || busy) return;
    const rp = randomPlace();
    const tone = detectToneLocal(t);
    const id = 'mood-' + Date.now();
    addMoodSticker({ id, lat: rp.lat, lng: rp.lng, text: t, place: `${rp.place} · 随机落点`, color: MOOD_TONES[tone].color, rot: pickRot(id), tone });
    setPinned({ lat: rp.lat, lng: rp.lng, place: rp.place, excludeId: id });
    setText('');
  };

  // 单张心情贴（列表与时间线共用同一份 JSX，避免漂移）
  const renderSticker = (s: MoodSticker) => (
    <div key={s.id} className="relative border-2 border-black shadow-[2px_3px_0_rgba(0,0,0,0.55)] px-3 py-2.5" style={{ background: s.color, transform: `rotate(${s.rot * 0.4}deg)` }}>
      <span className="absolute -top-2 left-4 w-3 h-3 rounded-full bg-[#ff00ff] border-2 border-black" />
      <div className="text-[12px] leading-snug text-black font-medium break-words pr-5">{s.text}</div>
      <div className="font-pixel text-[7px] text-black/55 tracking-wider mt-1.5 flex items-center gap-1">
        {s.tone && <span className="border border-black/40 px-1 py-0.5 text-black/70">{MOOD_TONES[s.tone].label}</span>}
        <span>◍ {s.place} · {dayKey(s.createdAt)}</span>
      </div>
      <button onClick={() => removeMoodSticker(s.id)} className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center text-black/40 hover:text-[#d23b3b] active:translate-y-px">
        <X className="w-3.5 h-3.5" strokeWidth={3} />
      </button>
    </div>
  );

  // 仅当存在「带情绪的真心情贴」才进回望（即使 view 残留 'retrospect' 也回落列表，避免没 Tab 可切回的死角）
  const showRetrospect = view === 'retrospect' && summary.count > 0;
  const dist = showRetrospect ? toneDistribution(stickers) : [];
  const maxTone = dist.reduce((m, b) => Math.max(m, b.count), 0);
  const timeline = showRetrospect ? groupMoodsByTimeline(stickers) : [];

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">MOOD-CURATOR</div>
        </div>
        <MapPin className="w-4 h-4" strokeWidth={2.5} style={{ color: '#caa400' }} />
      </div>

      {/* Stat strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black shrink-0" style={{ color: ACCENT }}>
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>心情 {stickers.length}</span><span className="opacity-40">|</span>
          <span>落点 {cities} 处</span><span className="opacity-40">|</span>
          <span>{summary.domTone ? `底色 · ${MOOD_TONES[summary.domTone].label}` : '判情绪 · 判地名'}</span>
        </div>
      </div>

      {/* 列表 / 回望 切换（有「带情绪的真心情贴」才显示，与回望空态口径一致；只种了白色卡片时不显示） */}
      {summary.count > 0 && (
        <div className="flex border-2 border-black bg-[#EAEAEA] p-1 mx-3 mt-2.5 gap-1 shrink-0">
          {([['list', '列表 ◎'], ['retrospect', '回望 ◍']] as const).map(([v, label]) => (
            <button key={v} onClick={() => { setView(v); setPinned(null); }}
              className={`flex-1 font-pixel text-[9px] py-1.5 tracking-wider ${view === v ? 'bg-black text-[#ffd23b]' : 'text-black/60'}`}>{label}</button>
          ))}
        </div>
      )}

      {/* 写心情 */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0 space-y-2">
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={2}
          placeholder="此刻在世界某处的心情…（带个地名会更准）"
          className="w-full border-2 border-black px-2.5 py-2 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white resize-none"
        />
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-black/45 leading-snug flex-1">判出情绪给颜色、判出地名就钉那里；判不出落「此处」，或🎲随机漫游</span>
          <button onClick={submitRandom} disabled={busy || !text.trim()} title="随机漫游到一处"
            className="border-2 border-black px-2 py-1.5 text-[12px] bg-white shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-40">🎲</button>
          <button onClick={submit} disabled={busy || !text.trim()}
            className="flex items-center gap-1 border-2 border-black px-3 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-40" style={{ background: ACCENT }}>
            {busy ? '识别中…' : '钉下 ◍'}
          </button>
        </div>
      </div>

      {/* 记一笔后「这一带」——跨标记地理联动，把孤立的点织成记忆网。
          区分「你留下过」(心情/各 agent 主动落点) 与「也在这一带」(看过读过的书影/音乐照片城市)，不把看过说成到过 */}
      {nearby.length > 0 && (
        <div className="px-3 py-2 border-b-2 border-black bg-[#FFFCF2] shrink-0 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[8px] text-black/55 tracking-wider truncate pr-2">◍ {pinned?.place} 一带</span>
            <button onClick={() => setPinned(null)} className="shrink-0 text-black/35 hover:text-black/70 active:translate-y-px"><X className="w-3.5 h-3.5" strokeWidth={3} /></button>
          </div>
          {([['visited', '你留下过'], ['seen', '也在这一带']] as const).map(([og, label]) => {
            const items = nearby.filter((n) => n.origin === og);
            if (!items.length) return null;
            return (
              <div key={og} className="flex flex-wrap items-center gap-1">
                <span className="font-pixel text-[7px] text-black/40 tracking-wider mr-0.5 shrink-0">{label}</span>
                {items.map((n) => (
                  <span key={n.id} className="inline-flex items-center gap-1 border-2 px-1.5 py-0.5 text-[10px] bg-white" style={{ borderColor: n.color }}>
                    <span>{kindEmoji(n.kind)}</span><span className="truncate max-w-[120px]">{n.label}</span>
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* 列表视图（非回望时显示，含 view 残留但已无真心情贴的回落情形） */}
      {!showRetrospect && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
          {stickers.length === 0 && (
            <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_rgba(0,0,0,0.85)] text-center">
              <MapPin className="w-6 h-6 mx-auto mb-2" strokeWidth={2} style={{ color: '#caa400' }} />
              <div className="text-[12px] font-bold mb-1">还没有心情贴</div>
              <div className="text-[11px] text-black/55 leading-snug">写一句此刻的心情，它会钉到世界地图上对应的地方，在中间的地球上也能看到。</div>
            </div>
          )}
          {stickers.map(renderSticker)}
          {stickers.length > 0 && <div className="text-center text-[8px] font-pixel text-black/30 py-1 tracking-widest">心情贴与中间地球同一份 · 缩放不跟跑</div>}
        </div>
      )}

      {/* 回望视图：情绪分布卡 + 时间线分组（showRetrospect 已保证有带情绪的真心情贴） */}
      {showRetrospect && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
          {/* 回望卡片：六色情绪分布 */}
          <div className="border-2 border-black bg-white px-3 py-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.55)]">
            <div className="font-pixel text-[11px] tracking-wider">心情足迹 ◍</div>
            <div className="text-[10px] text-black/55 mt-1">总 {summary.count} 条 · {summary.cities} 处落点 · {summary.days} 天</div>
            <div className="mt-2.5 space-y-1">
              {dist.map((b) => (
                <div key={b.tone} className="flex items-center gap-1.5">
                  <span className="font-pixel text-[7px] border border-black/40 px-1 py-0.5 text-black/70 w-5 text-center shrink-0">{b.label}</span>
                  <div className="flex-1 h-2 bg-[#e8e8e8] border border-black/20">
                    <div className="h-full" style={{ width: `${maxTone ? (b.count / maxTone) * 100 : 0}%`, background: b.color }} />
                  </div>
                  <span className="font-pixel text-[7px] text-black/50 w-4 text-right shrink-0">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
          {/* 时间线：今天 / 本周 / 更早 */}
          {timeline.map((g) => (
            <div key={g.key}>
              <div className="font-pixel text-[11px] mb-2 mt-3 first:mt-0 tracking-wider">{g.label}</div>
              <div className="space-y-2.5">{g.stickers.map(renderSticker)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
