// ════════════════════════════════════════════════════════════════════════════
// 可观测 · FrostBus —— 统一事件总线（借鉴 langchain callbacks/tracers，剥到 ~40 行）
// ────────────────────────────────────────────────────────────────────────────
// langchain 把「执行过程」标准化成一棵带 run_id/parent_id 的生命周期事件树，被动 handler 订阅——
// 同一棵树既能喂 logger/tracer 做可观测，又能反转成前端 token 流。pocket-earth 之前只有零散 trace+health，
// 没有统一事件词汇、没有把一次 router→curator→skill→enrich 串成可追踪的树。这里补这个地基。
//
// 只借三个抽象：① 统一事件词汇(带 runId/parentId 串成树) ② 被动订阅 ③ handler 抛错绝不打断主流程(与舱壁价值观一致)。
// 不搬 langchain 的 CallbackManager(2826 行)/跨事件循环队列——单浏览器单 React 树用不上。
// ════════════════════════════════════════════════════════════════════════════

export type RunType = 'router' | 'curator' | 'skill' | 'brain' | 'edge' | 'enrich' | 'geo';
export type Phase = 'start' | 'end' | 'error';

export interface FrostEvent {
  runId: string;            // 本节点 id
  parentId?: string;        // 父节点 id —— 串成调用树
  type: RunType;
  name: string;             // 显示名（如「云脑补全标签」/「resolvePlace」）
  phase: Phase;
  ts: number;               // Date.now()
  durMs?: number;           // end/error 时填
  note?: string;            // 一句「发生了什么」（命中/降级/重试…）
  tags?: string[];          // 徽章：['端侧'] / ['云'] / ['↻×1'] / ['fallback']
  ok?: boolean;
}

type Handler = (e: FrostEvent) => void;
const handlers = new Set<Handler>();
const buffer: FrostEvent[] = [];   // 小 ring buffer：让"订阅前已发"的事件(如 start/首阶段)能被晚挂载的订阅者补上

export const frostBus = {
  /** 订阅事件。返回退订函数。 */
  on(h: Handler): () => void { handlers.add(h); return () => { handlers.delete(h); }; },
  /** 发事件。先入 buffer 再通知；handler 抛错只吞掉——观测层绝不打断主流程（舱壁）。 */
  emit(e: FrostEvent): void {
    buffer.push(e); if (buffer.length > 300) buffer.shift();
    handlers.forEach((h) => { try { h(e); } catch { /* 观测层抛错不影响业务 */ } });
  },
  /** 取 buffer 里属于某次运行的历史事件（订阅者挂载时先 seed，补上订阅前发生的 start/首阶段）。 */
  recent(runId: string): FrostEvent[] { return buffer.filter((e) => e.runId === runId || e.parentId === runId); },
};

let _n = 0;
/** 生成一个会话内单调递增的 runId。 */
export const newRunId = (): string => `r${Date.now().toString(36)}${(_n++).toString(36)}`;

/** 便捷：发一条挂在 parentId 下的子事件（curator 各阶段 / skill 调用用）。 */
export function emitChild(parentId: string, name: string, opts?: { type?: RunType; phase?: Phase; note?: string; tags?: string[]; durMs?: number; ok?: boolean }): void {
  frostBus.emit({
    runId: newRunId(), parentId, name, ts: Date.now(),
    type: opts?.type ?? 'skill', phase: opts?.phase ?? 'end', note: opts?.note, tags: opts?.tags, durMs: opts?.durMs, ok: opts?.ok ?? true,
  });
}
