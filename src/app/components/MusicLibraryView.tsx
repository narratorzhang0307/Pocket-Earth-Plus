import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, ChevronDown, Music2 } from 'lucide-react';
import { groupSongs, songs, songTotal, GROUP_LABELS, type GroupKey, type Song } from '../data/musicCatalog';
import { resolveTracksByIds, type ResolvedTrack } from '../../../frost-agent/data/radio';

// 音乐曲库视图（music-curator 的「曲库」tab）：把所有歌曲做成条目，按 地域/城市/歌手/流派 归类。
// 点条目即播放（真实音源不可达时回落到示例音源，保证出声）。对话 tab 完全独立、不受影响。

function fallbackAudio(i: number): string {
  return `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(i % 8) + 1}.mp3`;
}

export default function MusicLibraryView() {
  const [by, setBy] = useState<GroupKey>('region');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [curId, setCurId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [srcMode, setSrcMode] = useState<'real' | 'fallback'>('real');
  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(false);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  const groups = useMemo(() => groupSongs(by), [by]);
  const artistFlat = useMemo(() => [...songs].sort((a, b) => a.artist.localeCompare(b.artist, 'zh') || a.title.localeCompare(b.title, 'zh')), []);

  // 切分组维度时，默认展开第一组
  useEffect(() => { setOpen(new Set(groups[0] ? [groups[0].key] : [])); }, [by, groups]);

  const cur = useMemo(() => (curId ? resolveTracksByIds([curId])[0] : null) as ResolvedTrack | undefined, [curId]);

  // 切歌：真实音源 7s 拿不到可播数据 → 回落示例音源
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !cur) return;
    let fell = false;
    setSrcMode('real');
    a.src = cur.audioUrl || '';
    a.load();
    if (playingRef.current) a.play().catch(() => {});
    const fallback = () => {
      if (fell) return; fell = true; setSrcMode('fallback');
      a.src = fallbackAudio(Math.abs(hashId(cur.id)) % 8); a.load();
      if (playingRef.current) a.play().catch(() => {});
    };
    a.addEventListener('error', fallback);
    const t = window.setTimeout(() => { if (a.readyState < 2) fallback(); }, 7000);
    return () => { window.clearTimeout(t); a.removeEventListener('error', fallback); };
  }, [curId, cur]);
  useEffect(() => { const a = audioRef.current; if (!a) return; if (playing) a.play().catch(() => {}); else a.pause(); }, [playing]);

  const playSong = (id: string) => {
    if (id === curId) { setPlaying((p) => !p); return; }
    setCurId(id); setPlaying(true);
  };
  const toggle = (k: string) => setOpen((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const Row = (s: Song, showArtistFirst = false) => {
    const active = s.id === curId;
    return (
      <button key={s.id} onClick={() => playSong(s.id)}
        className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 border-b border-black/10 transition-colors ${active ? 'bg-[#00ff88]/15' : 'hover:bg-[#00ff88]/8 active:bg-[#00ff88]/20'}`}>
        <div className="w-7 h-7 shrink-0 bg-black flex items-center justify-center border border-black shadow-[1px_1px_0_#00ff88]">
          {active && playing ? <Pause className="w-3.5 h-3.5 text-[#00ff88]" fill="currentColor" strokeWidth={0} /> : <Play className="w-3.5 h-3.5 text-[#00ff88] ml-0.5" fill="currentColor" strokeWidth={0} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold truncate leading-tight">{showArtistFirst ? s.artist : s.title}</div>
          <div className="text-[10px] text-black/50 truncate">{showArtistFirst ? s.title : s.artist}</div>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <span className="font-pixel text-[6px] text-black/40 border border-black/20 px-1 py-0.5">{s.genre}</span>
          <span className="font-pixel text-[6px] text-black/35 w-12 text-right truncate">{s.city}</span>
        </div>
      </button>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] min-h-0">
      {/* 分组维度切换 */}
      <div className="px-3 py-2 border-b-2 border-black bg-white shrink-0 flex items-center gap-2">
        <Music2 className="w-3.5 h-3.5 text-black/45 shrink-0" strokeWidth={2.5} />
        <div className="flex border-2 border-black bg-[#EAEAEA] p-0.5 flex-1">
          {GROUP_LABELS.map((g) => (
            <button key={g.key} onClick={() => setBy(g.key)}
              className={`flex-1 py-1 text-[10px] font-bold ${by === g.key ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>{g.label}</button>
          ))}
        </div>
        <span className="font-pixel text-[7px] text-black/40 shrink-0">{songTotal}</span>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {by === 'artist' ? (
          <div className="bg-white">{artistFlat.map((s) => Row(s, true))}</div>
        ) : (
          groups.map((grp) => {
            const isOpen = open.has(grp.key);
            return (
              <div key={grp.key} className="border-b-2 border-black/15">
                <button onClick={() => toggle(grp.key)} className="w-full flex items-center gap-2 px-3 py-2 bg-white sticky top-0 z-10 active:bg-black/5">
                  <div className="w-2.5 h-2.5 bg-[#00ff88] border border-black shrink-0" />
                  <span className="font-pixel text-[10px] tracking-wide flex-1 text-left truncate">{grp.key}</span>
                  <span className="font-pixel text-[7px] text-black/40">{grp.songs.length}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-black/50 transition-transform ${isOpen ? 'rotate-180' : ''}`} strokeWidth={2.5} />
                </button>
                {isOpen && <div className="bg-white">{grp.songs.map((s) => Row(s))}</div>}
              </div>
            );
          })
        )}
        <div className="text-center text-[8px] font-pixel text-black/30 py-3 tracking-widest">{songTotal} 首 · 按 {GROUP_LABELS.find((g) => g.key === by)?.label} 归类 · 点条目播放</div>
      </div>

      {/* 迷你播放条 */}
      {cur && (
        <div className="px-3 py-2 border-t-2 border-black bg-black text-[#7CFF6B] shrink-0 flex items-center gap-2.5">
          <div className="w-9 h-9 shrink-0 border border-[#7CFF6B]/50 bg-[#0a0a0a] overflow-hidden">{cur.cover && <img src={cur.cover} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-white truncate">{cur.title}<span className="text-white/45"> · {cur.artist}</span></div>
            <div className="font-pixel text-[6px] text-[#7CFF6B]/70 tracking-wider truncate mt-0.5">{cur.cityNameZh}{srcMode === 'fallback' ? ' · 示例音源' : ''}</div>
          </div>
          <button onClick={() => setPlaying((p) => !p)} className="w-9 h-9 border-2 border-[#7CFF6B] flex items-center justify-center active:scale-95">{playing ? <Pause className="w-4 h-4" fill="currentColor" strokeWidth={0} /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" strokeWidth={0} />}</button>
        </div>
      )}
      <audio ref={audioRef} onEnded={() => setPlaying(false)} />
    </div>
  );
}

function hashId(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
