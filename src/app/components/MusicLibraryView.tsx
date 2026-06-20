import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, ChevronDown, Music2, Maximize2, MapPin } from 'lucide-react';
import { groupSongs, songs, songTotal, GROUP_LABELS, type GroupKey, type Song } from '../data/musicCatalog';
import { resolveTracksByIds, type ResolvedTrack } from '../../../frost-agent/data/radio';
import { addUserMark, getUserMarksByKind, spreadCoord } from '../data/userMarks';
import { recordSignals } from '../../../frost-agent/harness/profile';
import musicCities from '../data/music-cities.json';
import { recordPlay } from '../lib/music/plays';
import { RadioStage } from './radio/RadioStage';

// 音乐曲库视图（music-agent 的「曲库」tab）：把所有歌曲做成条目，按 地域/城市/歌手/流派 归类。
// 点条目即播放（真实音源不可达时回落到示例音源，保证出声）。对话 tab 完全独立、不受影响。

function fallbackAudio(i: number): string {
  return `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(i % 8) + 1}.mp3`;
}

// 城市名 → 经纬度（取自音乐城市表，给「把歌钉到城市」用）
const CITY_LL = new Map((musicCities as { nameZh: string; lat: number; lng: number }[]).map((c) => [c.nameZh, [c.lng, c.lat] as [number, number]]));
const slug = (s: string) => (s || '').replace(/[\s·\-—:：,，.。!！?？'"'']/g, '').slice(0, 16);

export default function MusicLibraryView() {
  const [by, setBy] = useState<GroupKey>('region');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [curId, setCurId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [srcMode, setSrcMode] = useState<'real' | 'fallback'>('real');
  const [stageTrackId, setStageTrackId] = useState<string | null>(null); // 进入沉浸式电台（音乐形态）
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
    if (playingRef.current) a.play().catch(() => setPlaying(false));   // 自动播放被浏览器拦 → UI 同步成暂停，别假装在放
    const fallback = () => {
      if (fell) return; fell = true; setSrcMode('fallback');
      a.src = fallbackAudio(Math.abs(hashId(cur.id)) % 8); a.load();
      if (playingRef.current) a.play().catch(() => setPlaying(false));
    };
    a.addEventListener('error', fallback);
    const t = window.setTimeout(() => { if (a.readyState < 2) fallback(); }, 7000);
    return () => { window.clearTimeout(t); a.removeEventListener('error', fallback); };
  }, [curId, cur]);
  useEffect(() => { const a = audioRef.current; if (!a) return; if (playing) a.play().catch(() => setPlaying(false)); else a.pause(); }, [playing]);

  const [pinMsg, setPinMsg] = useState<string | null>(null);

  const playSong = (id: string) => {
    if (id === curId) { setPlaying((p) => !p); return; }
    setCurId(id); setPlaying(true);
    const s = songs.find((x) => x.id === id);   // 记一次收听 → 听歌记忆库 + 回流口味画像（含 genre/city）
    if (s) recordPlay({ id: s.id, title: s.title, artist: s.artist, genre: s.genre, city: s.city });
  };

  // 把当前歌曲钉到它所属城市（稳定 id 幂等去重 + 喂长期画像）。城市无坐标则提示。
  const pinTrack = () => {
    if (!cur) return;
    const ll = CITY_LL.get(cur.cityNameZh || '');
    if (!ll) { setPinMsg('这首歌的城市暂无坐标'); window.setTimeout(() => setPinMsg(null), 1800); return; }
    const id = `umu-${slug(cur.artist)}-${slug(cur.title)}`;
    if (getUserMarksByKind('music').some((m) => m.id === id)) { setPinMsg(`已在地球上 · ${cur.cityNameZh}`); window.setTimeout(() => setPinMsg(null), 1800); return; }
    const [lng, lat] = spreadCoord(id, ll[0], ll[1], 0.6);
    addUserMark({ id, kind: 'music', lng, lat, label: cur.title, meta: { track: cur.title, artist: cur.artist, city: cur.cityNameZh } });
    recordSignals('music', { cities: [cur.cityNameZh || ''], artists: [cur.artist] });
    setPinMsg(`已钉到地球 · ${cur.cityNameZh}`); window.setTimeout(() => setPinMsg(null), 1800);
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
          {/* 把这首歌钉到它的城市（让地球长出「我的音乐」点） */}
          <button onClick={pinTrack} title="把这首歌钉到地球" className="w-9 h-9 border-2 border-[#7CFF6B] flex items-center justify-center active:scale-95"><MapPin className="w-4 h-4" strokeWidth={2.5} /></button>
          {/* 进入沉浸式电台（城市封面 + DJ 开关 + 与 frost 对话） */}
          <button onClick={() => { setPlaying(false); setStageTrackId(curId); }} title="进入电台（沉浸播放）" className="w-9 h-9 border-2 border-[#7CFF6B] flex items-center justify-center active:scale-95"><Maximize2 className="w-4 h-4" strokeWidth={2.5} /></button>
        </div>
      )}
      {pinMsg && <div className="absolute left-1/2 -translate-x-1/2 bottom-20 z-50 border-2 border-black bg-black text-[#7CFF6B] text-[11px] px-3 py-1.5 shadow-[2px_2px_0_#000]">{pinMsg}</div>}
      <audio ref={audioRef} onEnded={() => setPlaying(false)} />

      {/* 沉浸式电台播放台（音乐形态进入；可切 DJ 开/关、音乐/播客） */}
      <RadioStage isOpen={!!stageTrackId} onClose={() => setStageTrackId(null)} startTrackId={stageTrackId ?? undefined} startMode="music" />
    </div>
  );
}

function hashId(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
