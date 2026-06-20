// 可观测 UI · 编排树：把 curator 的单行阶段进度，升级成边跑边长出来的「实时编排树」。
// 订阅 FrostBus，按 runId 收本次运行的根(curator)+子(各阶段)事件，渲成带耗时/状态/徽章的树。
// 这是 PPT「难点不在让模型更聪明，而在编排」的活证据——评委亲眼看到 router→curator→skill 一跳跳发生。
import { useEffect, useState } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { frostBus, type FrostEvent } from '../lib/observe/bus';

// 从 note（无则回落 name）派生「云/端侧/本地」色徽章——让树一眼看出每步在哪儿算（数据离没离设备）。显式 tags 优先。
const BADGE: Record<string, string> = {
  云: 'bg-amber-500/20 text-amber-300',
  端侧: 'bg-sky-500/20 text-sky-300',
  本地: 'bg-emerald-500/15 text-emerald-300/90',
};
function deriveBadge(note?: string): string | null {
  if (!note) return null;
  if (/Qwen|云|cloud/i.test(note)) return '云';
  if (/端侧|VL|CLIP|edge|WebLLM/i.test(note)) return '端侧';
  if (/resolvePlace|matchCatalog|本地|Mapbox|parse|catalog/i.test(note)) return '本地';
  return null;
}

function useRunEvents(runId: string | null): FrostEvent[] {
  const [events, setEvents] = useState<FrostEvent[]>([]);
  useEffect(() => {
    setEvents(runId ? frostBus.recent(runId) : []);   // 先 seed buffer 里订阅前已发的事件(start/首阶段)
    if (!runId) return;
    return frostBus.on((e) => {
      if (e.runId === runId || e.parentId === runId) setEvents((prev) => [...prev, e]);
    });
  }, [runId]);
  return events;
}

export default function RunTrace({ runId }: { runId: string | null }) {
  const events = useRunEvents(runId);
  const [, tick] = useState(0);
  // 让「进行中」步骤的耗时实时走动
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 200); return () => clearInterval(id); }, []);

  if (!runId || !events.length) return null;
  const root = events.find((e) => e.runId === runId && e.phase === 'start');
  const done = events.find((e) => e.runId === runId && e.phase !== 'start');
  const steps = events.filter((e) => e.parentId === runId).sort((a, b) => a.ts - b.ts);
  const now = Date.now();
  const total = ((done?.durMs ?? (now - (root?.ts ?? now))) / 1000).toFixed(2);

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900 p-3 font-mono text-[11px] leading-relaxed text-zinc-300 shadow-sm">
      <div className="flex items-center gap-2 text-zinc-100">
        {done
          ? (done.ok ? <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" strokeWidth={2.5} />)
          : <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" strokeWidth={2.5} />}
        <span className="font-semibold tracking-tight">{root?.name || '运行'}</span>
        <span className="ml-auto tabular-nums text-zinc-500">{total}s</span>
      </div>
      <div className="mt-2 space-y-1">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const nextTs = steps[i + 1]?.ts ?? done?.ts ?? now;
          const dur = Math.max(0, Math.round(nextTs - s.ts));
          const running = last && !done;
          return (
            <div key={s.runId} className="flex items-center gap-2">
              <span className="text-zinc-600 select-none">{last ? '└' : '├'}</span>
              {running
                ? <Loader2 className="w-2.5 h-2.5 animate-spin text-orange-400" strokeWidth={3} />
                : <Check className="w-2.5 h-2.5 text-emerald-400/70" strokeWidth={3} />}
              <span className={running ? 'text-zinc-100' : 'text-zinc-400'}>{s.name}</span>
              {s.note && <span className="text-zinc-500 truncate">· {s.note}</span>}
              {(s.tags && s.tags.length ? s.tags : ([deriveBadge(s.note) ?? deriveBadge(s.name)].filter(Boolean) as string[])).map((t) => (
                <span key={t} className={`rounded px-1 py-px text-[9px] leading-none ${BADGE[t] || 'bg-white/10 text-zinc-300'}`}>{t}</span>
              ))}
              <span className="ml-auto tabular-nums text-zinc-600">{dur}ms</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
