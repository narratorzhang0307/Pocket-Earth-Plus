import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Play, Square, RotateCcw, Check } from 'lucide-react';
import PixelAvatar from './PixelAvatar';
import { COUNCIL_AGENTS } from '../council/agents';
import { COUNCIL_MODES, modeDef, runCouncil, type CouncilMode, type CouncilMsg, type CouncilBackend } from '../council/engine';

// 圆桌议事运行页（我们的像素风）：选谁入场 + 选讨论模式 + 出题 → 多 agent 轮流发言。
// 机制仿 openhanako 频道群聊（见 council/engine.ts），UI 完全是 Pocket Earth 风格；与各 curator 解耦。

const ACCENT = '#00ff88';
interface Props { onBack: () => void }

export default function CouncilPage({ onBack }: Props) {
  const [phase, setPhase] = useState<'setup' | 'run'>('setup');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(['bookworm', 'reel', 'vinyl', 'contra']));
  const [mode, setMode] = useState<CouncilMode>('roundtable');
  const [topic, setTopic] = useState('');
  const [rounds, setRounds] = useState(2);
  const [backend, setBackend] = useState<CouncilBackend>('cloud');
  const [messages, setMessages] = useState<CouncilMsg[]>([]);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, speaking]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const start = async () => {
    if (selected.size < 2) return;
    setMessages([]); setPhase('run'); setRunning(true);
    const ac = new AbortController(); abortRef.current = ac;
    const ids = COUNCIL_AGENTS.filter((a) => selected.has(a.id)).map((a) => a.id);
    await runCouncil({ mode, agentIds: ids, topic, rounds, backend, onMessage: (m) => setMessages((prev) => [...prev, m]), onSpeaker: setSpeaking, signal: ac.signal });
    setRunning(false); setSpeaking(null);
  };
  const stop = () => { abortRef.current?.abort(); setRunning(false); setSpeaking(null); };

  const speaker = speaking ? COUNCIL_AGENTS.find((a) => a.id === speaking) : null;

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={phase === 'run' ? () => { stop(); setPhase('setup'); } : onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">COUNCIL · 圆桌议事</div>
          <div className="text-[9px] text-black/45 truncate">多 agent 讨论 / 辩论 / 法庭 · 你来组局</div>
        </div>
        <span className="font-pixel text-[7px] text-black/45">{selected.size} 人</span>
      </div>

      {phase === 'setup' ? (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {/* 议题 */}
          <div>
            <div className="font-pixel text-[9px] tracking-widest text-black/55 mb-1.5">议题 · TOPIC</div>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2}
              placeholder="抛一个话题让大家讨论，如「该不该搬去海边城市生活？」"
              className="w-full border-2 border-black px-2.5 py-2 text-[12px] bg-white focus:outline-none resize-none" />
          </div>

          {/* 模式 */}
          <div>
            <div className="font-pixel text-[9px] tracking-widest text-black/55 mb-1.5">模式 · MODE</div>
            <div className="grid grid-cols-2 gap-2">
              {COUNCIL_MODES.map((m) => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`text-left border-2 border-black p-2 shadow-[2px_2px_0_rgba(0,0,0,0.85)] active:translate-y-px ${mode === m.id ? 'bg-black text-[#7CFF6B]' : 'bg-white'}`}>
                  <div className="text-[12px] font-bold">{m.emoji} {m.label}</div>
                  <div className={`text-[9px] mt-0.5 ${mode === m.id ? 'text-[#7CFF6B]/70' : 'text-black/45'}`}>{m.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 花名册：点头像入场 / 退场 */}
          <div>
            <div className="font-pixel text-[9px] tracking-widest text-black/55 mb-1.5">在场的人 · 点头像加入或退出</div>
            <div className="grid grid-cols-2 gap-2">
              {COUNCIL_AGENTS.map((a) => {
                const on = selected.has(a.id);
                return (
                  <button key={a.id} onClick={() => toggle(a.id)}
                    className={`relative flex items-center gap-2 border-2 border-black p-1.5 text-left transition-all ${on ? 'bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]' : 'bg-[#E2E2E0] opacity-55'}`}>
                    <PixelAvatar spec={a.avatar} size={34} ring={a.color} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold leading-tight truncate">{a.name}</div>
                      <div className="text-[9px] text-black/50 leading-tight truncate">{a.tagline}</div>
                    </div>
                    {on && <span className="absolute -top-2 -right-2 w-4 h-4 flex items-center justify-center border-2 border-black" style={{ background: ACCENT }}><Check className="w-2.5 h-2.5" strokeWidth={4} /></span>}
                  </button>
                );
              })}
            </div>
            {mode === 'courtroom' && <div className="text-[9px] text-black/45 mt-1.5">⚖️ 法庭模式：在场的人前一半为正方、后一半为反方，最后由「庭长」裁断（没选庭长也会自动请来收尾）。</div>}
          </div>

          {/* 轮数 + 大脑（云端 / 端侧） */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-pixel text-[9px] tracking-widest text-black/55">每人轮数</div>
            <div className="flex border-2 border-black">
              {[1, 2, 3].map((r) => (
                <button key={r} onClick={() => setRounds(r)} className={`px-3 py-1 text-[11px] font-bold ${rounds === r ? 'text-black' : 'text-black/40'}`} style={rounds === r ? { background: ACCENT } : undefined}>{r}</button>
              ))}
            </div>
            <div className="font-pixel text-[9px] tracking-widest text-black/55 ml-1">大脑</div>
            <div className="flex border-2 border-black">
              <button onClick={() => setBackend('cloud')} className={`px-2.5 py-1 text-[11px] font-bold ${backend === 'cloud' ? 'text-black' : 'text-black/40'}`} style={backend === 'cloud' ? { background: ACCENT } : undefined}>☁ 云端</button>
              <button onClick={() => setBackend('edge')} className={`px-2.5 py-1 text-[11px] font-bold ${backend === 'edge' ? 'text-black' : 'text-black/40'}`} style={backend === 'edge' ? { background: ACCENT } : undefined}>🖥 端侧</button>
            </div>
          </div>
          <div className="text-[9px] text-black/45 leading-snug">
            {backend === 'cloud'
              ? '☁ 云端：DeepSeek 大模型，辩论质量最好（需联网 + DEEPSEEK_API_KEY）。'
              : '🖥 端侧：本地 Qwen（需装 ollama），离线可用、隐私不出端；未就绪时自动回落云端。'}
          </div>

          {/* 开始 */}
          <button onClick={start} disabled={selected.size < 2}
            className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-black text-[#7CFF6B] py-2.5 font-pixel text-[10px] tracking-widest shadow-[2px_2px_0_rgba(0,0,0,0.85)] active:translate-y-px disabled:opacity-40">
            <Play className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} /> 开始议事（{selected.size} 人 · {modeDef(mode).label}）
          </button>
          {selected.size < 2 && <div className="text-center text-[10px] text-black/40">至少选两个人才能开始讨论</div>}
        </div>
      ) : (
        <>
          {/* 议题条 */}
          <div className="px-3 py-2 border-b-2 border-black bg-black shrink-0 flex items-center gap-2" style={{ color: ACCENT }}>
            <span className="font-pixel text-[8px] tracking-wider shrink-0">{modeDef(mode).emoji} {modeDef(mode).label}</span>
            <span className="text-[11px] text-white truncate flex-1">{topic || '自由发挥'}</span>
            <span className="font-pixel text-[7px] tracking-wider shrink-0 opacity-80">{backend === 'cloud' ? '☁ 云端' : '🖥 端侧'}</span>
          </div>

          {/* 讨论流 */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((m) => {
              const a = COUNCIL_AGENTS.find((x) => x.id === m.speakerId)!;
              return (
                <div key={m.id} className="flex gap-2 items-start">
                  <div className="shrink-0"><PixelAvatar spec={a.avatar} size={34} ring={a.color} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] font-bold" style={{ color: a.color }}>{m.name}</span>
                      {m.role && <span className="font-pixel text-[6px] border border-black/40 px-1 py-0.5 text-black/55">{m.role}</span>}
                    </div>
                    <div className="border-2 border-black bg-white px-2.5 py-1.5 text-[12px] leading-relaxed shadow-[2px_2px_0_rgba(0,0,0,0.85)]" style={{ borderLeftColor: a.color, borderLeftWidth: 4 }}>{m.text}</div>
                  </div>
                </div>
              );
            })}
            {speaker && (
              <div className="flex gap-2 items-center">
                <PixelAvatar spec={speaker.avatar} size={28} ring={speaker.color} />
                <span className="font-pixel text-[8px] text-black/45 tracking-widest animate-pulse">{speaker.name} 正在发言…</span>
              </div>
            )}
            {!running && messages.length > 0 && <div className="text-center font-pixel text-[8px] text-black/30 py-1 tracking-widest">— 讨论结束 —</div>}
            <div ref={endRef} />
          </div>

          {/* 控制条 */}
          <div className="px-3 py-2.5 border-t-2 border-black bg-white shrink-0 flex gap-2">
            {running ? (
              <button onClick={stop} className="flex-1 flex items-center justify-center gap-1.5 border-2 border-black bg-[#d23b3b] text-white py-2 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px">
                <Square className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} /> 喊停
              </button>
            ) : (
              <>
                <button onClick={() => setPhase('setup')} className="flex-1 border-2 border-black bg-white py-2 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px">换人 / 换题</button>
                <button onClick={start} className="flex-1 flex items-center justify-center gap-1.5 border-2 border-black bg-black text-[#7CFF6B] py-2 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px">
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.5} /> 再来一轮
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
