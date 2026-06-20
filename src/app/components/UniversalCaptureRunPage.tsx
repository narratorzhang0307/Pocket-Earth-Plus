import { useState, useRef } from 'react';
import { ChevronLeft, ImagePlus, Check, RotateCcw, X } from 'lucide-react';
import { runCapture, DOMAIN_LABEL, DOMAIN_COLOR, type CaptureResult } from '../lib/capture/route';
import MoodReview from './MoodReview';
import RunTrace from './RunTrace';
import { startAgentRun } from '../lib/observe/bus';

// 统一万能记一笔 —— 一个框（+可选截图）记一切：frost 判这是书/影/乐/地点/心情 → 钉到对应图层。
// 沿用各域现成管线（见 lib/capture/route）；suggest-then-confirm，用户确认才落地球。
// 「记一笔 / 心情」双页：记一笔=统一录入；心情=回看累积的情绪足迹（原 mood-agent 的回望并到这里）。

interface Props { onBack: () => void }
const ACCENT = '#00ff88';
const star = (n: number) => '★★★★★'.slice(0, Math.max(0, Math.min(5, Math.round(n))));

export default function UniversalCaptureRunPage({ onBack }: Props) {
  const [tab, setTab] = useState<'jot' | 'mood'>('jot');   // 记一笔 / 心情回望
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);   // FrostBus 运行 id → RunTrace 实时编排树
  const [pinned, setPinned] = useState(false);
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { const rd = new FileReader(); rd.onload = () => setImage(typeof rd.result === 'string' ? rd.result : null); rd.readAsDataURL(f); }
    e.target.value = '';
  };

  const go = async () => {
    if ((!text.trim() && !image) || busy) return;
    setBusy(true); setResult(null); setPinned(false); setToast('');
    // 一次 FrostBus 运行 → RunTrace 把「判域 + 各子 agent 阶段」渲成实时编排树（与各 agent 同款可观测）
    const run = startAgentRun(`记一笔 · ${(text.trim() || '截图').slice(0, 16)}`); setRunId(run.runId);
    try {
      const d = await runCapture(text, image || undefined, (p, detail) => { setPhase(p); run.phase(p, detail); });
      run.end(!!d); setResult(d);
    } catch { run.end(false); setResult(null); }
    setBusy(false); setPhase('');
  };

  const confirm = async () => {
    if (!result || pinned) return;
    const r = await result.confirm();
    if (r.pinned) { setPinned(true); setToast(`已钉到地球 · ${result.where}`); }
    else setToast(result.where.includes('待补') ? '还没定位到地点，去对应 agent 补一下' : '没能钉上，换种说法再试');
    window.setTimeout(() => setToast(''), 2400);
  };

  const reset = () => { setResult(null); setRunId(null); setText(''); setImage(null); setPinned(false); setToast(''); };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">JOT-AGENT</div>
          <div className="text-[9px] text-black/45 truncate">一句话 / 截图 → frost 判域 → 钉到对应图层</div>
        </div>
      </div>

      {/* 记一笔 / 心情 切换（心情=把原 mood-agent 的回望并进来） */}
      <div className="flex border-b-2 border-black bg-[#EAEAEA] shrink-0">
        {([['jot', '记一笔 ◍'], ['mood', '心情 ◍']] as const).map(([v, label]) => (
          <button key={v} onClick={() => { setTab(v); setToast(''); }}
            className={`flex-1 font-pixel text-[9px] py-2 tracking-wider ${tab === v ? 'bg-black text-[#00ff88]' : 'text-black/55'}`}>{label}</button>
        ))}
      </div>

      {/* 说明条（仅记一笔页） */}
      {tab === 'jot' && (
      <div className="px-4 py-2 border-b-2 border-black bg-black shrink-0" style={{ color: ACCENT }}>
        <div className="font-pixel text-[8px] tracking-wider text-center">书 · 影 · 行程 · 心情 / 地点 —— 不用先选 agent</div>
      </div>
      )}

      {/* 输入（仅记一笔页） */}
      {tab === 'jot' && (
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0 space-y-2">
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={2}
          placeholder="随手写一句，如「看完了奥本海默，五星」「读完百年孤独」「上周去了京都」「今天有点累」"
          style={{ fontSize: '12px' }}   /* preflight 给 textarea 的 font-size:100% 继承了 html 16px、压过了 text-[12px]，内联强制 12px（= 绿框「一个框，记一切」同款）；占位文字自动继承 */
          className="w-full border-2 border-black px-2.5 py-2 text-[12px] leading-snug bg-[#EAEAEA] focus:outline-none focus:bg-white resize-none" />
        {image && (
          <div className="flex items-center gap-2">
            <img src={image} alt="截图" className="w-10 h-10 object-cover border-2 border-black" />
            <span className="text-[10px] text-black/55 flex-1">已附截图（帮 frost 认片 / 认书）</span>
            <button onClick={() => setImage(null)} className="text-black/40 hover:text-[#d23b3b] active:translate-y-px"><X className="w-3.5 h-3.5" strokeWidth={3} /></button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={busy} title="附一张截图"
            className="flex items-center gap-1 border-2 border-black px-2 py-1.5 text-[11px] bg-white shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-40">
            <ImagePlus className="w-3.5 h-3.5" strokeWidth={2.5} /> 截图
          </button>
          <button onClick={go} disabled={busy || (!text.trim() && !image)}
            className="flex-1 flex items-center justify-center gap-1.5 border-2 border-black bg-black text-[#7CFF6B] py-2 font-pixel text-[10px] tracking-widest shadow-[2px_2px_0_rgba(0,0,0,0.85)] active:translate-y-px disabled:opacity-40">
            {busy ? (phase || '识别中…') : '记一笔 ◍'}
          </button>
        </div>
      </div>
      )}

      {/* 结果 / 预览（记一笔）｜ 心情回望 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {tab === 'mood' ? <MoodReview /> : (<>
        {runId && <div className="mb-2"><RunTrace runId={runId} /></div>}
        {!result && !busy && !runId && (
          <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_rgba(0,0,0,0.85)] text-center">
            <div className="text-[12px] font-bold mb-1">一个框，记一切</div>
            <div className="text-[11px] text-black/55 leading-snug">frost 会判断你这句是书、影、行程还是心情，自动钉到地球对应的图层——你不用先想"该进哪个 agent"。</div>
          </div>
        )}

        {result && (
          <div className="border-2 border-black bg-[#FFFCF2] shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            {/* 判域条 */}
            <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: DOMAIN_COLOR[result.domain] }}>
              <span className="font-pixel text-[8px] tracking-widest text-black">frost 判断 · {DOMAIN_LABEL[result.domain]}</span>
              <span className="font-pixel text-[7px] text-black/60">{result.needPlace ? '◍ 待补地点' : result.ok ? '◍ 可钉' : '× 没认出'}</span>
            </div>
            <div className="px-2.5 py-2 space-y-1.5">
              {result.ok ? (
                <>
                  <div className="text-[13px] font-bold leading-snug break-words">{result.title}</div>
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-black/70">
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 border border-black" style={{ background: DOMAIN_COLOR[result.domain] }} /> 落点 · {result.where}</span>
                    {typeof result.rating === 'number' && result.rating > 0 && <span className="text-[#caa400]">{star(result.rating)}</span>}
                  </div>
                  {result.note && <div className="text-[10px] text-[#a05a2c] leading-snug">{result.note}</div>}
                  {!pinned ? (
                    <div className="flex gap-2 pt-1">
                      <button onClick={confirm} disabled={result.needPlace}
                        className="flex-1 flex items-center justify-center gap-1 border-2 border-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-40" style={{ background: ACCENT }}>
                        <Check className="w-3.5 h-3.5" strokeWidth={3} /> {result.needPlace ? '需补地点 · 去对应 agent' : '确认钉到地球'}
                      </button>
                      <button onClick={reset}
                        className="flex items-center justify-center gap-1 border-2 border-black bg-white px-3 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px">
                        <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.5} /> 重记
                      </button>
                    </div>
                  ) : (
                    <button onClick={reset} className="w-full border-2 border-black bg-white px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px mt-1">再记一笔</button>
                  )}
                </>
              ) : (
                <>
                  <div className="text-[12px] text-black/75 leading-snug">{result.note}</div>
                  <button onClick={reset} className="w-full border-2 border-black bg-white px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px mt-1">重记</button>
                </>
              )}
            </div>
          </div>
        )}
        </>)}
      </div>

      {/* toast */}
      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 border-2 border-black bg-black text-[#7CFF6B] px-3 py-1.5 font-pixel text-[8px] tracking-wider shadow-[2px_2px_0_rgba(0,0,0,0.85)]">{toast}</div>
      )}
    </div>
  );
}
