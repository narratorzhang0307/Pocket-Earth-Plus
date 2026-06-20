import { useReducer, useState, useEffect, useRef } from 'react';
import { ChevronLeft, Plane, MapPin, Sparkles, Check, PenLine, Camera } from 'lucide-react';
import {
  DESTINATIONS, PREFERENCES, runPlan, confirmTrip, pinManualStop, runArchive, confirmArchive,
  MODE_LABEL, MODE_COLOR, TRIP_MODES, getTravelStats, type Pref, type TripPlan, type TripMode, type TripArchive,
} from '../lib/travel';
import { getUserMarksByKind, subscribeUserMarks } from '../data/userMarks';
import RunTrace from './RunTrace';
import { startCuratorRun } from '../lib/observe/bus';

// travel-curator 运行页 —— 行程 agent（薄 UI，业务逻辑在 src/app/lib/travel/*）。
// B 线（规划）：选目的地+喜好 → 三级排序（云脑按你跨域口味挑 / 端侧真后端 / 本地兜底）→ 逐日行程 → 钉星球。
//   隐私：画像只走云脑那一级；端侧只按旅行偏好，画像不出端。
// A 线（存档·P0 手动版）：车票截图自动识别属 P1（端侧 OCR+脱敏），P0 先手填一笔已走过的行程钉点。
// 和攻略 App 的区别：走过的地方沉淀成中间地球上的私人足迹。

interface Props { onBack: () => void }
const ROSE = '#ff3b6b';
const today = () => new Date().toISOString().slice(0, 10);

export default function TravelRunPage({ onBack }: Props) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeUserMarks(force), []);

  const [destName, setDestName] = useState(DESTINATIONS[0].name);
  const [prefs, setPrefs] = useState<Set<Pref>>(() => new Set<Pref>(['美食', '小众']));
  const [days, setDays] = useState(2);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [phase, setPhase] = useState('');
  const [planRunId, setPlanRunId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // A 线手动录入 state
  const [manualOpen, setManualOpen] = useState(false);
  const [mCity, setMCity] = useState('');
  const [mDate, setMDate] = useState(today());
  const [mMode, setMMode] = useState<TripMode>('train');

  const completed = getUserMarksByKind('travel');
  const tripCities = new Set(completed.map((m) => String((m.meta || {}).city || ''))).size;
  const stats = getTravelStats();   // P2 旅行档案（城市/类别/季节 + 跨 agent 重叠）

  const togglePref = (p: Pref) => setPrefs((prev) => {
    const next = new Set(prev); next.has(p) ? next.delete(p) : next.add(p); return next;
  });
  const showToast = (s: string) => { setToast(s); window.setTimeout(() => setToast(null), 2400); };

  // B 线规划：runPlan 三级排序（云脑按画像挑 → 端侧真后端 → 本地兜底），mode 透明告知
  const makePlan = async () => {
    const run = startCuratorRun(`规划行程 · ${destName} ${days}天`); setPlanRunId(run.runId);
    setPlanning(true); setPhase('');
    const tp = await runPlan({ destName, prefs: [...prefs], days }, (p, detail) => { setPhase(p); run.phase(p, detail); });
    run.end(!!tp);
    setPlan(tp);
    if (tp.mode === '本地') showToast('云脑/端侧未就绪 · 本地按喜好排序');
    setPlanning(false);
  };

  // 完成行程 → 每个停留点钉星球（逻辑在 lib/travel/pin.ts，幂等去重 + 回流画像）
  const finishTrip = () => {
    if (!plan) return;
    const { added } = confirmTrip(plan.dest, plan.days, [...prefs]);
    showToast(added ? `已钉到星球 · ${plan.dest.name} ${added} 个足迹` : `${plan.dest.name} 的足迹都已在星球上`);
  };

  // A 线手动钉一笔
  const submitManual = async () => {
    const r = await pinManualStop({ city: mCity, date: mDate, mode: mMode });
    if (r.ok) { showToast(`已记下 · ${mCity.trim()} 钉到星球`); setMCity(''); setManualOpen(false); }
    else if (r.reason === 'needCity') showToast('先填一个城市名');
    else showToast('这个城市名连 OSM 也查不到，换个中/英文写法试试');
  };

  // A 线截图提炼：原图只进端侧 vision、脱敏后才上云结构化
  const shotRef = useRef<HTMLInputElement>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archivePhase, setArchivePhase] = useState('');
  const [archiveRunId, setArchiveRunId] = useState<string | null>(null);
  const [archiveDraft, setArchiveDraft] = useState<TripArchive | null>(null);

  const onPickShots = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const run = startCuratorRun(`截图存档 · ${[...files].length} 张`); setArchiveRunId(run.runId);
    setArchiveBusy(true); setArchiveDraft(null); setArchivePhase('读取截图'); run.phase('读取截图');
    try {
      const urls = await Promise.all([...files].slice(0, 8).map((f) => new Promise<string>((res) => {
        const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => res(''); r.readAsDataURL(f);
      })));
      const { archive, reason } = await runArchive(urls.filter(Boolean), (p, detail) => { setArchivePhase(p); run.phase(p, detail); });
      run.end(!!archive);
      if (archive) setArchiveDraft(archive);
      else if (reason === 'noEdge') showToast('端侧模型未就绪：去控制台加载端侧 Qwen3，或用下面手动录入');
      else showToast('没读出行程信息，换张清晰点的截图或手填');
    } finally { setArchiveBusy(false); setArchivePhase(''); if (shotRef.current) shotRef.current.value = ''; }
  };

  const confirmArchiveDraft = async () => {
    if (!archiveDraft) return;
    const { added } = await confirmArchive(archiveDraft);
    showToast(added ? `已钉到星球 · ${archiveDraft.title} ${added} 个点` : '这些点都已在星球上');
    setArchiveDraft(null);
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">TRAVEL-CURATOR</div>
        </div>
        <Plane className="w-4 h-4" strokeWidth={2.5} style={{ color: ROSE }} />
      </div>

      {/* Stat strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black shrink-0" style={{ color: ROSE }}>
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>目的地 {DESTINATIONS.length}</span><span className="opacity-40">|</span>
          <span>足迹城市 {tripCities}</span><span className="opacity-40">|</span>
          <span>上地球 {completed.length}</span>
        </div>
      </div>

      {/* 规划输入 */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0 space-y-2">
        <div className="flex gap-2 items-center">
          <select value={destName} disabled={planning} onChange={(e) => { setDestName(e.target.value); setPlan(null); }}
            className="border-2 border-black px-2 py-1.5 text-[12px] bg-white font-bold disabled:opacity-50 max-w-[42%]">
            {DESTINATIONS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
          <div className="flex items-center border-2 border-black">
            {[1, 2].map((d) => (
              <button key={d} disabled={planning} onClick={() => { setDays(d); setPlan(null); }}
                className={`px-2 py-1.5 text-[11px] font-bold disabled:opacity-50 ${days === d ? 'text-black' : 'text-black/40'}`}
                style={days === d ? { background: ROSE } : undefined}>{d}天</button>
            ))}
          </div>
          <button onClick={makePlan} disabled={planning}
            className="ml-auto flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-50" style={{ background: ROSE }}>
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} /> {planning ? (phase || '规划中') : '规划'}
          </button>
        </div>
        {/* 喜好 chips */}
        <div className="flex flex-wrap gap-1.5">
          {PREFERENCES.map((p) => {
            const on = prefs.has(p);
            return (
              <button key={p} disabled={planning} onClick={() => { togglePref(p); setPlan(null); }}
                className={`text-[11px] px-2 py-0.5 border-2 border-black disabled:opacity-50 ${on ? 'text-black font-bold' : 'text-black/50 bg-white'}`}
                style={on ? { background: ROSE } : undefined}>{p}</button>
            );
          })}
        </div>
        {planRunId && <div className="mt-1.5"><RunTrace runId={planRunId} /></div>}
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {plan ? (
          <>
            <div className="flex items-center justify-between">
              <div className="font-pixel text-[9px] tracking-wider text-black/55 flex items-center gap-1.5">
                {plan.dest.name} · {plan.days.length}天 ·
                <span className="inline-flex items-center gap-1" style={{ color: MODE_COLOR[plan.mode] }}>
                  <span className="w-1.5 h-1.5" style={{ background: MODE_COLOR[plan.mode] }} />{MODE_LABEL[plan.mode]}
                </span>
              </div>
              <button onClick={finishTrip} className="flex items-center gap-1 border-2 border-black bg-black px-2 py-1 text-[10px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px" style={{ color: ROSE }}>
                <Check className="w-3 h-3" strokeWidth={3} /> 完成行程 · 钉星球
              </button>
            </div>
            {plan.days.map((d) => (
              <div key={d.day} className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
                <div className="px-2.5 py-1 border-b-2 border-black font-pixel text-[9px] tracking-widest" style={{ background: ROSE }}>DAY {d.day}</div>
                <div className="divide-y divide-black/10">
                  {d.stops.map((s, i) => (
                    <div key={i} className="flex gap-2.5 px-2.5 py-2 items-start">
                      <div className="w-5 h-5 shrink-0 mt-0.5 border border-black flex items-center justify-center font-pixel text-[8px]" style={{ background: ROSE }}>{i + 1}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-bold truncate">{s.name}</span>
                          <span className="font-pixel text-[7px] border border-black/40 px-1 text-black/60">{s.tag}</span>
                        </div>
                        <div className="text-[11px] text-black/60 leading-snug mt-0.5">{s.note}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="text-center text-[8px] font-pixel text-black/30 py-1 tracking-widest">
              {plan.mode === '云脑' ? '按你的电影/读书/音乐口味挑 · 完成后钉成私人足迹' : '完成后钉成地球上的私人足迹'}
            </div>
          </>
        ) : (
          <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_rgba(0,0,0,0.85)] text-center">
            <MapPin className="w-6 h-6 mx-auto mb-2" strokeWidth={2} style={{ color: ROSE }} />
            <div className="text-[12px] font-bold mb-1">选目的地 + 喜好，帮你排行程</div>
            <div className="text-[11px] text-black/55 leading-snug">会回顾你的电影/读书/音乐口味来挑地点（只走云脑、画像不出端）；走完点「完成行程」，停留点会落到中间的地球上。</div>
          </div>
        )}

        {/* A 线 P1：截图自动提炼（端侧 vision 读票据 → 脱敏 → 云脑结构化） */}
        <div className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
          <input ref={shotRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickShots(e.target.files)} />
          <button onClick={() => shotRef.current?.click()} disabled={archiveBusy}
            className="w-full flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold active:translate-y-px disabled:opacity-50">
            <Camera className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: ROSE }} />
            {archiveBusy ? (archivePhase || '提炼中…') : '把车票/酒店截图一股脑丢进来'}
            <span className="ml-auto text-[9px] text-black/40">端侧识别</span>
          </button>
          <div className="px-2.5 pb-2 text-[10px] text-black/45 leading-snug">原图只在端侧读、不出手机；身份证/手机号自动打码；只把脱敏后的文字交云脑理成行程。</div>
          {archiveRunId && <div className="px-2.5 pb-2"><RunTrace runId={archiveRunId} /></div>}
          {archiveDraft && (
            <div className="px-2.5 pb-2.5 border-t-2 border-black/10 pt-2 space-y-1">
              <div className="text-[12px] font-bold">{archiveDraft.title}</div>
              <div className="text-[10px] text-black/55">
                {archiveDraft.dateStart ? `${archiveDraft.dateStart}${archiveDraft.dateEnd ? `~${archiveDraft.dateEnd}` : ''} · ` : ''}
                途经 {archiveDraft.cities.join('、') || '—'}
              </div>
              {archiveDraft.segments.map((s, i) => (
                <div key={`g${i}`} className="text-[10.5px] text-black/70">🚆 {s.fromCity || '?'}→{s.toCity || '?'}{s.code ? ` ${s.code}` : ''}{s.date ? ` ${s.date}` : ''}</div>
              ))}
              {archiveDraft.stays.map((s, i) => (
                <div key={`s${i}`} className="text-[10.5px] text-black/70">🏨 {s.hotel || s.city}{s.checkIn ? ` ${s.checkIn}` : ''}</div>
              ))}
              {archiveDraft.spots.map((s, i) => (
                <div key={`p${i}`} className="text-[10.5px] text-black/70">📍 {s.name}{s.city ? ` · ${s.city}` : ''}</div>
              ))}
              <div className="text-[9px] text-[#c08a00] leading-snug pt-0.5">⚠ 端侧识别可能有误，钉之前扫一眼；错了用下面手动录入改。</div>
              <button onClick={confirmArchiveDraft} className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px mt-1" style={{ color: ROSE }}>
                <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} /> 钉到星球
              </button>
            </div>
          )}
        </div>

        {/* A 线 P0：手动记一笔已走过的行程 */}
        <div className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
          <button onClick={() => setManualOpen((v) => !v)} className="w-full flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold active:translate-y-px">
            <PenLine className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: ROSE }} />
            手动记一笔已走过的行程
            <span className="ml-auto text-[9px] text-black/40">{manualOpen ? '收起' : '展开'}</span>
          </button>
          {manualOpen && (
            <div className="px-2.5 pb-2.5 pt-1 border-t-2 border-black/10 space-y-2">
              <div className="text-[10px] text-black/45 leading-snug">车票/酒店截图自动识别还在路上（要端侧 OCR + 脱敏）；先手填一个去过的城市钉到星球。</div>
              <div className="flex gap-2">
                <input value={mCity} onChange={(e) => setMCity(e.target.value)} placeholder="城市（中/英文，如 京都 / Kyoto）"
                  className="flex-1 min-w-0 border-2 border-black px-2 py-1.5 text-[12px] bg-white" />
                <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)}
                  className="border-2 border-black px-1.5 py-1.5 text-[11px] bg-white" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TRIP_MODES.map((m) => (
                  <button key={m.key} onClick={() => setMMode(m.key)}
                    className={`text-[10px] px-2 py-0.5 border-2 border-black ${mMode === m.key ? 'text-black font-bold' : 'text-black/50 bg-white'}`}
                    style={mMode === m.key ? { background: ROSE } : undefined}>{m.label}</button>
                ))}
              </div>
              <button onClick={submitManual} className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px" style={{ color: ROSE }}>
                <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} /> 钉到星球
              </button>
            </div>
          )}
        </div>

        {/* P2 旅行档案：统计 + 跨 agent 联动 */}
        {stats.spots > 0 && (
          <div className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="px-2.5 py-1.5 bg-black"><span className="font-pixel text-[8px] tracking-widest" style={{ color: ROSE }}>旅行档案</span></div>
            <div className="px-3 py-2.5 space-y-2.5">
              <div className="flex justify-around text-center">
                {[[stats.cities, '城市'], [stats.trips, '趟行程'], [stats.spots, '足迹点']].map(([n, label]) => (
                  <div key={label as string}>
                    <div className="text-[18px] font-bold leading-none" style={{ color: ROSE }}>{n as number}</div>
                    <div className="text-[9px] text-black/45 mt-0.5">{label as string}</div>
                  </div>
                ))}
              </div>
              {stats.topTags.length > 0 && (
                <div>
                  <div className="font-pixel text-[7px] text-black/40 tracking-wider mb-1">最爱</div>
                  <div className="flex flex-wrap gap-1">
                    {stats.topTags.map((t) => <span key={t.tag} className="text-[10px] border border-black/40 px-1.5 py-0.5 bg-[#EAEAEA]">{t.tag} ×{t.n}</span>)}
                  </div>
                </div>
              )}
              {stats.seasons.length > 0 && (
                <div className="text-[10.5px] text-black/60">偏好季节：{stats.seasons.map((s) => `${s.season}(${s.n})`).join(' · ')}</div>
              )}
              {stats.overlaps.length > 0 && (
                <div>
                  <div className="font-pixel text-[7px] text-black/40 tracking-wider mb-1">在这些城市，你的世界交汇</div>
                  <div className="space-y-0.5">
                    {stats.overlaps.slice(0, 6).map((o) => (
                      <div key={o.city} className="text-[10.5px] text-black/70">📍 {o.city} <span className="text-black/45">· 也留下了 {o.kinds.join('、')}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 已钉足迹 */}
        {completed.length > 0 && (
          <div>
            <div className="font-pixel text-[9px] tracking-widest text-black/45 mb-1.5 mt-2">已钉星球的足迹</div>
            <div className="flex flex-wrap gap-1.5">
              {completed.slice(0, 40).map((m) => (
                <span key={m.id} className="text-[10px] border-2 border-black bg-white px-1.5 py-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5" style={{ background: ROSE }} />{m.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50 border-2 border-black bg-black text-[11px] px-3 py-1.5 shadow-[2px_2px_0_#000] text-center max-w-[88%]" style={{ color: ROSE }}>
          {toast}
        </div>
      )}
    </div>
  );
}
