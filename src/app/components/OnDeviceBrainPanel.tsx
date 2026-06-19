// 端侧大脑面板（B 路线）：一键把 Qwen3-0.6B 加载进浏览器（WebGPU），真端侧推理、不出端。
// 启用后 edgeSafe 的文本三件套(意图分类/排序/对话)自动改走浏览器内 Qwen；未启用时回退服务端 /api/edge。
import { useEffect, useState } from 'react';
import { Cpu, Loader2, Check, AlertTriangle, X, Send } from 'lucide-react';
import {
  loadWebllm, unloadWebllm, getWebllmState, subscribeWebllm, webllmSupported,
  webllmEdge, type WebllmState,
} from '../../../frost-agent/edge/webllmEdge';

const ACCENT = '#00aa55';

export default function OnDeviceBrainPanel() {
  const [st, setSt] = useState<WebllmState>(getWebllmState());
  const [supported, setSupported] = useState<boolean | null>(null);
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
    <div className="border-2 border-black bg-white p-2.5 shadow-[3px_3px_0_rgba(0,0,0,0.85)]">
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4 shrink-0" strokeWidth={2.5} style={{ color: ACCENT }} />
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-[10px] tracking-wider">端侧大脑 · ON-DEVICE QWEN</div>
          <div className="text-[9.5px] text-black/55 leading-tight mt-0.5">
            {ready
              ? `${st.modelId} 在本机浏览器运行 · 不出端`
              : '把 Qwen3 加载进浏览器（WebGPU），意图/选择全本地跑'}
          </div>
        </div>
        {/* 状态徽标 */}
        {ready ? (
          <span className="shrink-0 flex items-center gap-1 font-pixel text-[7px] uppercase tracking-wider border border-black px-1.5 py-1" style={{ background: ACCENT, color: '#fff' }}>
            <Check className="w-3 h-3" strokeWidth={3} />端侧运行中
          </span>
        ) : busy ? (
          <span className="shrink-0 flex items-center gap-1 font-pixel text-[7px] uppercase tracking-wider border border-black bg-black text-[#00ff88] px-1.5 py-1">
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={3} />{pct}%
          </span>
        ) : (
          <span className="shrink-0 font-pixel text-[7px] uppercase tracking-wider border border-black bg-[#EAEAEA] px-1.5 py-1 text-black/55">未启用</span>
        )}
      </div>

      {/* 进度条 */}
      {busy && (
        <div className="mt-2">
          <div className="h-2 border-2 border-black bg-[#EAEAEA] overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${pct}%`, background: ACCENT }} />
          </div>
          <div className="text-[8.5px] text-black/45 mt-1 truncate leading-tight">{st.text || '加载中…'}</div>
        </div>
      )}

      {/* 错误 / 不支持提示 */}
      {st.phase === 'error' && (
        <div className="mt-2 flex items-start gap-1.5 border-2 border-black bg-[#fff3f3] text-[#b00] text-[9.5px] p-1.5 leading-snug">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={2.5} />
          <span className="min-w-0">{st.text}</span>
        </div>
      )}
      {supported === false && st.phase !== 'error' && (
        <div className="mt-2 text-[9px] text-black/45 leading-snug">
          当前浏览器未检测到 WebGPU（需 Safari 26 / iOS 26 或 Chrome / Edge）。未启用时自动回退服务端端侧 / 云。
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 mt-2">
        {!ready ? (
          <button
            onClick={() => loadWebllm().catch(() => {})}
            disabled={busy || supported === false}
            className="flex items-center gap-1 border-2 border-black px-3 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-white disabled:opacity-40"
            style={{ background: ACCENT }}
          >
            {busy ? '加载中…' : `启用端侧 Qwen3-0.6B`}
          </button>
        ) : (
          <button
            onClick={() => unloadWebllm()}
            className="flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[10px] font-bold bg-white shadow-[1px_1px_0_#000] active:translate-y-px"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2.5} />卸载释放显存
          </button>
        )}
        <span className="text-[8.5px] text-black/40 leading-tight flex-1">
          {ready ? '对话 / 意图 / 选择已走端侧；首屏不下载，按需 ~400MB' : '首次启用约下载 400MB 权重，之后缓存离线可用'}
        </span>
      </div>

      {/* 端侧试一句：就绪后直接用浏览器内 Qwen 答一句（可见的端侧推理证据） */}
      {ready && (
        <div className="mt-2.5 border-t-2 border-dashed border-black/15 pt-2">
          <div className="flex items-center gap-1.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') askOnDevice(); }}
              placeholder="端侧试一句，如：用一句话夸夸杭州"
              className="flex-1 min-w-0 border-2 border-black px-2 py-1.5 text-[11px] bg-[#EAEAEA] focus:outline-none focus:bg-white"
            />
            <button
              onClick={askOnDevice}
              disabled={thinking || !q.trim()}
              className="shrink-0 flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[10px] font-bold text-white shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-40"
              style={{ background: ACCENT }}
            >
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
  );
}
