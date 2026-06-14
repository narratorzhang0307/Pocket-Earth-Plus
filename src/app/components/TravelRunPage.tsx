import { useReducer, useState, useEffect } from 'react';
import { ChevronLeft, Plane, MapPin, Sparkles, Check } from 'lucide-react';
import { DESTINATIONS, PREFERENCES, destination, planTrip, type Pref, type DayPlan } from '../data/travel';
import { addUserMark, getUserMarksByKind, subscribeUserMarks, spreadCoord } from '../data/userMarks';
import { edgeSafe } from '../../../frost-agent/edge/contract';

// travel-curator 运行页 —— 行程 agent。
// 输入目的地 + 喜好 → 端侧按喜好规划逐日路线；行程完成后，每个停留点自动钉到星球（与 tab1 联动）。
// 和攻略 App 的区别：规划在端侧、不上传喜好；走过的地方沉淀成地球上的私人足迹。

interface Props { onBack: () => void }
const ROSE = '#ff3b6b';

export default function TravelRunPage({ onBack }: Props) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeUserMarks(force), []);

  const [destName, setDestName] = useState(DESTINATIONS[0].name);
  const [prefs, setPrefs] = useState<Set<Pref>>(() => new Set<Pref>(['美食', '小众']));
  const [days, setDays] = useState(2);
  const [plan, setPlan] = useState<DayPlan[] | null>(null);
  const [planMode, setPlanMode] = useState<'端侧' | '本地' | null>(null);
  const [planning, setPlanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const dest = destination(destName)!;
  const completed = getUserMarksByKind('travel');
  const tripCities = new Set(completed.map((m) => String((m.meta || {}).city || ''))).size;

  const togglePref = (p: Pref) => setPrefs((prev) => {
    const next = new Set(prev); next.has(p) ? next.delete(p) : next.add(p); return next;
  });
  const showToast = (s: string) => { setToast(s); window.setTimeout(() => setToast(null), 2200); };

  // 端侧规划：edgeSelector.rank 按喜好给 POI 排序（端侧「挑」），失败则本地命中度排序
  const makePlan = async () => {
    setPlanning(true);
    const prefStr = [...prefs].join('、') || '随便逛逛';
    let scores: number[] | undefined;
    try {
      const cand = dest.pois.map((p) => `${p.name}（${p.tag}）${p.note}`);
      const s = await edgeSafe.rank(`我的旅行偏好：${prefStr}`, cand);
      if (s.length === dest.pois.length && s.some((x) => x > 0)) scores = s;
    } catch { /* 端侧未就绪 → 本地 */ }
    setPlan(planTrip(dest, [...prefs], days, scores));
    setPlanMode(scores ? '端侧' : '本地');
    setPlanning(false);
  };

  // 完成行程 → 每个停留点钉到星球（travel）
  const finishTrip = () => {
    if (!plan) return;
    const date = new Date().toISOString().slice(0, 10);
    let n = 0;
    plan.forEach((d) => d.stops.forEach((s) => {
      const id = `utr-${Date.now()}-${n++}`;
      const [lng, lat] = spreadCoord(id, s.lng, s.lat, 0.04);
      addUserMark({ id, kind: 'travel', lng, lat, label: s.name, meta: { city: dest.name, tag: s.tag, note: s.note, date } });
    }));
    showToast(`已钉到星球 · ${dest.name} ${n} 个足迹`);
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
          <div className="text-[9px] text-black/45 truncate">行程 agent · 端侧规划 · 完成即钉星球</div>
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
          <select value={destName} onChange={(e) => { setDestName(e.target.value); setPlan(null); }}
            className="border-2 border-black px-2 py-1.5 text-[12px] bg-white font-bold">
            {DESTINATIONS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
          <div className="flex items-center border-2 border-black">
            {[1, 2].map((d) => (
              <button key={d} onClick={() => { setDays(d); setPlan(null); }}
                className={`px-2 py-1.5 text-[11px] font-bold ${days === d ? 'text-black' : 'text-black/40'}`}
                style={days === d ? { background: ROSE } : undefined}>{d}天</button>
            ))}
          </div>
          <button onClick={makePlan} disabled={planning}
            className="ml-auto flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-50" style={{ background: ROSE }}>
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} /> {planning ? '规划中' : '端侧规划'}
          </button>
        </div>
        {/* 喜好 chips */}
        <div className="flex flex-wrap gap-1.5">
          {PREFERENCES.map((p) => {
            const on = prefs.has(p);
            return (
              <button key={p} onClick={() => { togglePref(p); setPlan(null); }}
                className={`text-[11px] px-2 py-0.5 border-2 border-black ${on ? 'text-black font-bold' : 'text-black/50 bg-white'}`}
                style={on ? { background: ROSE } : undefined}>{p}</button>
            );
          })}
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {plan ? (
          <>
            <div className="flex items-center justify-between">
              <div className="font-pixel text-[9px] tracking-wider text-black/55">
                {dest.name} · {days}天 · {planMode === '端侧' ? '端侧按喜好排序' : '本地按喜好排序'}
              </div>
              <button onClick={finishTrip} className="flex items-center gap-1 border-2 border-black bg-black text-white px-2 py-1 text-[10px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px" style={{ color: ROSE }}>
                <Check className="w-3 h-3" strokeWidth={3} /> 完成行程 · 钉星球
              </button>
            </div>
            {plan.map((d) => (
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
            <div className="text-center text-[8px] font-pixel text-black/30 py-1 tracking-widest">端侧管「挑」· 完成后钉成地球上的私人足迹</div>
          </>
        ) : (
          <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_rgba(0,0,0,0.85)] text-center">
            <MapPin className="w-6 h-6 mx-auto mb-2" strokeWidth={2} style={{ color: ROSE }} />
            <div className="text-[12px] font-bold mb-1">选目的地 + 喜好，端侧帮你排行程</div>
            <div className="text-[11px] text-black/55 leading-snug">不上传喜好，规划在端上完成；走完点「完成行程」，停留点会落到中间的地球上。</div>
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
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50 border-2 border-black bg-black text-[11px] px-3 py-1.5 shadow-[2px_2px_0_#000]" style={{ color: ROSE }}>
          {toast}
        </div>
      )}
    </div>
  );
}
