import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ArrowUp } from 'lucide-react';
import { runFrost } from '../../../frost-agent/harness/router';
import type { FrostIntent } from '../../../frost-agent/harness/types';
import { getSuggestion, subscribeHeartbeat, adoptSuggestion } from '../../../frost-agent/harness/heartbeat';
import { derive, STATE_LABEL, type FrostState } from '../../../frost-agent/buddy/poses';
import { themeFor, THEME_LABEL, type FrostTheme } from '../../../frost-agent/buddy/themes';
import FrostBuddy, { FrostAvatar } from './FrostBuddy';
import UserZhaIcon from './UserZhaIcon';

// FROST · 总 agent 宠物页（第一阶段：界面 + 状态）
// 整页走「全黑终端」配色，和其它 curator 的浅灰界面拉开层级、凸显总 agent。
// 上：随对话变表情的 ASCII 方盒宠物；中：路线A 快捷入口（统领子 agent）；
// 下：跟 FROST 对话（经 runFrost 委派子 agent），展示回复 + thinking trace。

interface Turn {
  role: 'user' | 'frost';
  text: string;
  trace?: string[];
  intent?: FrostIntent;
  runTarget?: string;   // 这轮意图对应可展开的 curator
}

interface Props {
  onBack: () => void;
  onRun?: (target: string) => void;   // 跳到某 curator 运行页（路线A 联动）
}

// 路线A：FROST 把意图派给子 agent。快捷入口直接落到 curator 运行页。
const QUICK: { label: string; target: string }[] = [
  { label: '来份歌单', target: 'music-curator' },
  { label: '整理相册', target: 'photos-curator' },
  { label: '翻翻我的书', target: 'books-curator' },
  { label: '聊聊电影', target: 'movies-curator' },
  { label: '记一笔', target: 'jot' },
  { label: '造个 agent', target: 'agent-forge' },
];

// 对话后若意图对得上某 curator，给一个「展开」入口
const INTENT_RUN: Partial<Record<FrostIntent, string>> = {
  open_dj: 'music-curator',
  playlist: 'music-curator',
};

export default function FrostBuddyPage({ onBack, onRun }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<FrostState | null>(null);   // 一次性脉冲：celebrate / dizzy
  const [theme, setTheme] = useState<FrostTheme>('none');         // 当前聊天主题（换装）
  const [sug, setSug] = useState(getSuggestion());
  const endRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeHeartbeat(() => setSug(getSuggestion())), []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, busy]);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const buddyState = useMemo<FrostState>(
    () => flash ?? derive({ busy, attention: !!sug }),
    [flash, busy, sug],
  );

  const pulse = (s: FrostState, ms: number) => {
    setFlash(s);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), ms);
  };

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    setInput('');
    const history = turns.map((t) => ({ role: t.role, text: t.text }));
    setTurns((t) => [...t, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await runFrost({ now: new Date(), userText: text, history });
      const data = res.data as { playlist?: unknown[] } | undefined;
      const landed = !!(data?.playlist?.length || (res.radioActions && res.radioActions.length));
      setTurns((t) => [...t, { role: 'frost', text: res.reply, trace: res.trace, intent: res.intent, runTarget: INTENT_RUN[res.intent] }]);
      setTheme(themeFor(text, res.intent));   // 据这轮提问+意图自动换装
      if (landed) pulse('celebrate', 2800);
    } catch {
      setTurns((t) => [...t, { role: 'frost', text: '我这边断了一下，再说一遍？' }]);
      pulse('dizzy', 1500);
    } finally {
      setBusy(false);
    }
  };

  const takeSuggestion = () => {
    const s = adoptSuggestion();
    setSug(getSuggestion());
    if (s?.target) onRun?.(s.target);
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate text-black">FROST</div>
          <div className="text-[9px] text-black/45 truncate">总 agent · 统领所有 agent</div>
        </div>
      </div>

      {/* 路线A 快捷入口：FROST 把活派给子 agent（移到 buddy 上方）*/}
      <div className="shrink-0 border-b-2 border-black bg-white px-3 py-2 overflow-x-auto">
        <div className="flex items-center gap-2 w-max">
          <span className="font-pixel text-[6px] tracking-widest text-black/35 shrink-0">派给子 agent →</span>
          {QUICK.map((q) => (
            <button
              key={q.target}
              onClick={() => { if (!busy) onRun?.(q.target); }}
              disabled={busy}
              className="shrink-0 border-2 border-black bg-[#EAEAEA] px-2 py-1 text-[10px] text-black outline-none focus:outline-none active:translate-y-px hover:bg-[#00ff88]/15 transition-colors disabled:opacity-40"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* 宠物舞台：固定高度（buddy 表情/建议怎么变都不撑动它）。底色 = 对话区同为 #EAEAEA、二者间无边框 →
          一道隐形线：线以上 buddy 随便动，线以下对话位置纹丝不动；对话增多则在线下独立滚动看全。 */}
      <div className="shrink-0 flex flex-col items-center px-4 pt-4 pb-2 overflow-hidden" style={{ background: '#EAEAEA' }}>
        <div className="flex items-center justify-center" style={{ height: 178 }}>
          <FrostBuddy state={buddyState} theme={theme} size={26} color="#1d3e57" warmColor="#9a7b2e" glow={false} />
        </div>
        <div className="flex items-center justify-center" style={{ height: 16 }}>
          <span className="font-pixel text-[7px] tracking-[0.3em] uppercase" style={{ color: buddyState === 'celebrate' ? '#9a7b2e' : '#234a63' }}>
            {buddyState === 'idle' && theme !== 'none' ? THEME_LABEL[theme] : STATE_LABEL[buddyState]}
          </span>
        </div>
        <div className="flex items-center justify-center mt-1" style={{ height: 24 }}>
          {sug && !busy && (
            <button
              onClick={takeSuggestion}
              className="max-w-full border-2 border-black bg-white px-2.5 py-1 font-pixel text-[7px] tracking-wider text-black active:translate-y-px truncate"
            >
              {sug.text} · {sug.cta || '运行'}
            </button>
          )}
        </div>
      </div>

      {/* 对话区 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3 bg-[#EAEAEA]">
        {turns.length === 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2 max-w-[96%]">
              <div className="shrink-0 mt-0.5"><FrostAvatar size={26} /></div>
              <div className="flex flex-col gap-2 min-w-0 flex-1">
                <div className="font-pixel text-[7px] tracking-[0.2em] text-black/50">FROST</div>
                <div className="bg-white text-black border-2 border-black px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
                  我是弗洛斯特。在上界司命所创造的一切事物中，弗洛斯特是最完美的，最有威力的，也是最难以理解的。
                </div>
              </div>
            </div>
            <div className="text-[10px] text-black/40 pl-9 leading-relaxed">
              试试：「我在读波拉尼奥，帮我建个歌单」「讲讲布宜诺斯艾利斯」「跟着日落走」
            </div>
          </div>
        )}

        {turns.map((turn, i) => turn.role === 'user' ? (
          <div key={i} className="self-end flex flex-row-reverse items-start gap-2 max-w-[88%]">
            <div className="shrink-0 mt-0.5"><UserZhaIcon size={26} ring="#111" /></div>
            <div className="bg-white text-black border-2 border-black px-3 py-2 text-[12px] leading-relaxed shadow-[2px_2px_0_rgba(0,0,0,0.85)]">{turn.text}</div>
          </div>
        ) : (
          <div key={i} className="flex items-start gap-2 max-w-[96%]">
            <div className="shrink-0 mt-0.5"><FrostAvatar size={26} /></div>
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <div className="font-pixel text-[7px] tracking-[0.2em] text-black/50">FROST</div>
              {turn.text && (
                <div className="bg-white text-black border-2 border-black px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap shadow-[2px_2px_0_rgba(0,0,0,0.85)]">{turn.text}</div>
              )}

              {/* thinking trace（浅底版：灰卡 + 端侧绿高亮）*/}
              {turn.trace && turn.trace.length > 0 && (
                <div className="border-2 border-black/30 bg-[#E2E2E0]">
                  <div className="px-2.5 py-1 border-b border-black/15 font-pixel text-[6px] tracking-widest text-black/40 uppercase">thinking</div>
                  <div className="px-2.5 py-1.5 space-y-1">
                    {turn.trace.slice(0, 10).map((step, idx) => {
                      const isEdge = step.includes('端侧') || step.includes('Selector');
                      return (
                        <div key={idx} className={`flex gap-2 text-[10px] leading-snug ${isEdge ? 'bg-[#00ff88]/25 px-1 py-0.5 text-black/75 font-medium' : 'text-black/45'}`}>
                          <span className="text-black/30 w-4 shrink-0 tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
                          <span className="min-w-0">{step.replace(/^●\s*/, '')}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 路线A：意图对得上 curator 时给「展开」入口 */}
              {turn.runTarget && (
                <button
                  onClick={() => { if (!busy) onRun?.(turn.runTarget!); }}
                  disabled={busy}
                  className="self-start border-2 border-black bg-[#00ff88] px-2.5 py-1 font-pixel text-[7px] tracking-wider active:translate-y-px disabled:opacity-40"
                >
                  ▶ 在 {turn.runTarget} 里展开
                </button>
              )}
            </div>
          </div>
        ))}

        {busy && <div className="font-pixel text-[8px] text-black/45 tracking-widest">⋯ FROST 正在编排 ⋯</div>}
        <div ref={endRef} />
      </div>

      {/* 输入 */}
      <div className="px-3 py-3 border-t-2 border-black bg-white shrink-0">
        <form className="flex gap-2 items-center" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            type="text" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
            placeholder="对 FROST 说……（Enter 发送）"
            className="flex-1 h-10 border-2 border-black bg-[#EAEAEA] text-black text-[12px] px-3 outline-none focus:bg-white transition-colors min-w-0 disabled:opacity-50 placeholder:text-black/40"
          />
          <button type="submit" disabled={busy || !input.trim()} className="w-10 h-10 border-2 border-black bg-[#00ff88] flex items-center justify-center active:translate-y-px shrink-0 disabled:opacity-30">
            <ArrowUp className="w-4 h-4" strokeWidth={3} />
          </button>
        </form>
      </div>
    </div>
  );
}
