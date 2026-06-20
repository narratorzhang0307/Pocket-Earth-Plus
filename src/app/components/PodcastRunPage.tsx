import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Play, Pause, Mic, Maximize2 } from 'lucide-react';
import { RADIO_CITIES } from '../../../frost-agent/data/radio';
import { RadioStage } from './radio/RadioStage';

// podcast-agent 运行页 —— 城市播客：每座城一段深度文化叙事（文稿 + DJ 音频）。
// 与 music-agent 同源（同一资料库），但策展的是「城市播客」而非歌单。
// 数据驱动：从资料库筛出有播客的城市；换数据三视图自动更新。

const PODS = RADIO_CITIES.filter((c) => c.podcast && c.podcast.length > 0).map((c) => ({
  slug: c.slug,
  city: c.cityNameZh,
  freq: c.station.freq,
  seg: c.podcast[0],
}));

interface Props {
  onBack: () => void;
  embedded?: boolean;
}

// 可达示例音源：真实音源（私有对象存储直链）当前不可达时回落，保证播放闭环出声。
function fallbackAudio(i: number): string {
  return `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(i % 8) + 1}.mp3`;
}

export default function PodcastRunPage({ onBack, embedded }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [srcMode, setSrcMode] = useState<'real' | 'fallback'>('real');
  const [stageSlug, setStageSlug] = useState<string | null>(null); // 进入沉浸式电台（播客形态）
  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(false);
  const idx = PODS.findIndex((p) => p.slug === sel);
  const cur = idx >= 0 ? PODS[idx] : null;

  useEffect(() => { playingRef.current = playing; }, [playing]);

  // 切换播客：真实音源连接超时 / 出错时回落到示例音源
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !cur) return;
    let fell = false;
    setSrcMode('real');
    a.src = cur.seg.audioUrl || '';
    a.load();
    if (playingRef.current) a.play().catch(() => {});
    const fallback = () => {
      if (fell) return;
      fell = true;
      setSrcMode('fallback');
      a.src = fallbackAudio(Math.max(0, idx));
      a.load();
      if (playingRef.current) a.play().catch(() => {});
    };
    a.addEventListener('error', fallback);
    const t = window.setTimeout(() => { if (a.readyState < 2) fallback(); }, 7000);
    return () => { window.clearTimeout(t); a.removeEventListener('error', fallback); };
  }, [sel, idx, cur]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.play().catch(() => {}); else a.pause();
  }, [playing]);

  const pick = (slug: string) => {
    if (slug === sel) { setPlaying((p) => !p); return; }
    setSel(slug);
    setPlaying(true);
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans relative overflow-hidden">
      {/* Header（嵌入双 tab 时隐藏，大头交给外层）*/}
      {!embedded && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
          <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
            <ChevronLeft className="w-4 h-4" strokeWidth={3} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-pixel text-[11px] tracking-wider truncate">PODCAST-AGENT</div>
            <div className="text-[9px] text-black/45 truncate">城市播客 agent · {PODS.length} 城有播客</div>
          </div>
          <Mic className="w-4 h-4 text-black/50" strokeWidth={2.5} />
        </div>
      )}

      {/* 播客列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {PODS.length === 0 && (
          <div className="text-[11px] text-black/45 bg-white border-2 border-black p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">资料库里还没有城市播客。</div>
        )}
        {PODS.map((p) => {
          const active = p.slug === sel;
          return (
            <div key={p.slug} className={`border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] ${active ? 'bg-white' : 'bg-white'}`}>
              <button onClick={() => pick(p.slug)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 active:translate-y-px">
                {/* 播放/暂停方块 */}
                <div className="w-9 h-9 shrink-0 bg-black flex items-center justify-center border border-black shadow-[1px_1px_0px_#00ff88]">
                  {active && playing
                    ? <Pause className="w-4 h-4 text-[#00ff88]" fill="currentColor" strokeWidth={0} />
                    : <Play className="w-4 h-4 text-[#00ff88] ml-0.5" fill="currentColor" strokeWidth={0} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold truncate">{p.city}<span className="font-normal text-black/40 text-[10px]"> · CH {p.freq.toFixed(1)}</span></div>
                  <div className="text-[10px] text-black/45 truncate">{p.seg.title} · {p.seg.subtitle}</div>
                </div>
              </button>
              {/* 稿子不整篇透露：仅在播客模式里随音频逐字浮现（见后续电台播放器） */}
            </div>
          );
        })}
      </div>

      {/* 播放条 */}
      {cur && (
        <div className="px-3 py-2 border-t-2 border-black bg-black text-[#00ff88] shrink-0 flex items-center gap-2.5">
          <div className="w-9 h-9 shrink-0 border border-[#00ff88]/50 bg-[#0a0a0a] flex items-center justify-center"><Mic className="w-4 h-4 text-[#00ff88]/70" strokeWidth={2} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-white truncate">{cur.city} · 城市播客</div>
            <div className="font-pixel text-[6px] text-[#00ff88]/70 tracking-wider truncate mt-0.5">{cur.seg.subtitle}{srcMode === 'fallback' ? ' · 示例音源' : ''}</div>
          </div>
          <button onClick={() => setPlaying((p) => !p)} className="w-9 h-9 border-2 border-[#00ff88] flex items-center justify-center active:scale-95">
            {playing ? <Pause className="w-4 h-4" fill="currentColor" strokeWidth={0} /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" strokeWidth={0} />}
          </button>
          {/* 进入沉浸式电台（城市大图 + 稿子随声音逐字浮现 + 与 frost 对话） */}
          <button onClick={() => { setPlaying(false); setStageSlug(cur.slug); }} title="进入电台（沉浸播放）" className="w-9 h-9 border-2 border-[#00ff88] flex items-center justify-center active:scale-95">
            <Maximize2 className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      )}
      <audio ref={audioRef} onEnded={() => setPlaying(false)} />

      {/* 沉浸式电台播放台（播客形态进入；含音乐/播客两种形态切换） */}
      <RadioStage isOpen={!!stageSlug} onClose={() => setStageSlug(null)} startCitySlug={stageSlug ?? undefined} startMode="podcast" />
    </div>
  );
}
