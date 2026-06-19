// 端侧引擎开关（B 路线）：默认收起成一行小开关，点开才展开完整面板（加载/进度/试一句）。
// 它是「基础设施开关」而非 agent——把 Qwen3-0.6B 加载进浏览器（WebGPU），启用后 edgeSafe
// 的文本三件套(意图分类/排序/对话)改走浏览器内 Qwen；未启用回退服务端 /api/edge。
// 视觉上做轻（细边、灰底、无大投影），区别于下方的 agent 卡。
import { useEffect, useState } from 'react';
import { Cpu, Loader2, Check, AlertTriangle, X, Send, ChevronDown } from 'lucide-react';
import {
  loadWebllm, unloadWebllm, getWebllmState, subscribeWebllm, webllmSupported,
  webllmEdge, type WebllmState,
} from '../../../frost-agent/edge/webllmEdge';

const ACCENT = '#00aa55';

export default function OnDeviceBrainPanel() {
  const [st, setSt] = useState<WebllmState>(getWebllmState());
  const [supported, setSupported] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);           // 默认收起
  // 端侧试一句：加载完成后直接用浏览器内 Qwen 答一句（可见的端侧推理证据）
  const [q, setQ] = useState('');
  const [ans, setAns] = useState('');
  const [thinking, setThinking] = useState(false);
  const [ms, setMs] = useState(0);
  useEffect(() => subscribeWebllm(() => setSt({ ...getWebllmState() })), []);
  useEffect(() => { webllmSupported().then(setSupported); }, []);

  const pct = Math.round(st.progress * 100);
  const busy = st.phase === 'loading';
  const ready = st.phase === 'ready';
  const showDetail = open || busy || st.phase === 'error';   // 加载中/出错强制展开，确保进度与报错可见

  const askOnDevice = async () => {
    const text = q.trim();
    if (!text || thinking) return;
    setThinking(true); setAns('');
    const t0 = performance.now();
    const reply = await webllmEdge.chat(text);
    setMs(Math.round(performance.now() - t0));
    setAns(reply || '(端侧无回应)');
    setThinking(false);
  };

  return (
    <div className="border border-black/40 bg-[#ededed]">
      {/* 收起态：一行小开关（整行可点 → 展开/收起） */}
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left">
        <Cpu className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} style={{ color: ACCENT }} />
        <span className="font-pixel text-[8px] tracking-wider text-black/70">端侧引擎 · ON-DEVICE QWEN</span>
        <span className="flex-1" />
        {ready ? (
          <span className="shrink-0 flex items-center gap-1 text-[9px] font-bold" style={{ color: ACCENT }}>● 运行中</span>
        ) : busy ? (
          <span className="shrink-0 flex items-center gap-1 text-[9px] font-bold text-black/70"><Loader2 className="w-3 h-3 animate-spin" strokeWidth={3} />{pct}%</span>
        ) : (
          <span className="shrink-0 text-[9px] text-black/40">○ 未启用</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-black/40 transition-transform ${showDetail ? 'rotate-180' : ''}`} strokeWidth={2.5} />
      </button>

      {/* 展开态：完整面板 */}
      {showDetail && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-black/15">
          <div className="text-[9.5px] text-black/55 leading-snug mb-2">
            {ready ? `${st.modelId} 在本机浏览器运行 · 不出端` : '把 Qwen3 加载进浏览器（WebGPU），意图/选择全本地跑'}
          </div>

          {/* 进度条 */}
          {busy && (
            <div className="mb-2">
              <div className="h-2 border-2 border-black bg-[#EAEAEA] overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${pct}%`, background: ACCENT }} />
              </div>
              <div className="text-[8.5px] text-black/45 mt-1 truncate leading-tight">{st.text || '加载中…'}</div>
            </div>
          )}

          {/* 错误 / 不支持提示 */}
          {st.phase === 'error' && (
            <div className="mb-2 flex items-start gap-1.5 border-2 border-black bg-[#fff3f3] text-[#b00] text-[9.5px] p-1.5 leading-snug">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={2.5} />
              <span className="min-w-0">{st.text}</span>
            </div>
          )}
          {supported === false && st.phase !== 'error' && (
            <div className="mb-2 text-[9px] text-black/45 leading-snug">
              当前浏览器未检测到 WebGPU（需 Safari 26 / iOS 26 或 Chrome / Edge）。未启用时自动回退服务端端侧 / 云。
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            {!ready ? (
              <button onClick={() => loadWebllm().catch(() => {})} disabled={busy || supported === false}
                className="flex items-center gap-1 border-2 border-black px-3 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-white disabled:opacity-40" style={{ background: ACCENT }}>
                {busy ? '加载中…' : '启用端侧 Qwen3-0.6B'}
              </button>
            ) : (
              <button onClick={() => unloadWebllm()} className="flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[10px] font-bold bg-white shadow-[1px_1px_0_#000] active:translate-y-px">
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />卸载释放显存
              </button>
            )}
            <span className="text-[8.5px] text-black/40 leading-tight flex-1">
              {ready ? '对话 / 意图 / 选择已走端侧；首屏不下载，按需 ~400MB' : '首次启用约下载 400MB 权重，之后缓存离线可用'}
            </span>
          </div>

          {/* 端侧试一句 */}
          {ready && (
            <div className="mt-2.5 border-t-2 border-dashed border-black/15 pt-2">
              <div className="flex items-center gap-1.5">
                <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') askOnDevice(); }}
                  placeholder="端侧试一句，如：用一句话夸夸杭州"
                  className="flex-1 min-w-0 border-2 border-black px-2 py-1.5 text-[11px] bg-[#EAEAEA] focus:outline-none focus:bg-white" />
                <button onClick={askOnDevice} disabled={thinking || !q.trim()}
                  className="shrink-0 flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[10px] font-bold text-white shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-40" style={{ background: ACCENT }}>
                  {thinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={3} /> : <Send className="w-3.5 h-3.5" strokeWidth={2.5} />}
                </button>
              </div>
              {(ans || thinking) && (
                <div className="mt-1.5 border-2 border-black bg-[#f6fff9] p-2 text-[11px] leading-snug">
                  <div className="font-pixel text-[7px] tracking-widest mb-1 flex items-center gap-1.5" style={{ color: ACCENT }}>
                    ◍ 端侧 QWEN3 回答{ms ? ` · ${ms}ms` : ''}{thinking ? ' · 推理中…' : ''}
                  </div>
                  <div className="text-black/80">{ans || '…'}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
