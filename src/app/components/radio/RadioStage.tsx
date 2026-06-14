// 城市电台播放器 —— 全屏播放台（像素风）。音乐 / 播客共用同一套 UI：
//  中间是城市/日落封面，下面 FROST 字幕一个字一个字蹦出来。
//  ① 音乐：封面 + 进度 + 上/下城 + 播放 + DJ（解说叠在音乐上、音乐压低做背景）+ 与 frost 对话
//  ② 播客：同一布局，把这一集的稿子作为 FROST 字幕、随主音频进度逐字浮现（不整篇透露）
// 一首/一段放完自动续播下一首；最后一首放完切到下一座城。对话接 frost-agent 的 runFrost。
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Minus, Maximize2, ChevronLeft, ChevronRight, SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import { RADIO_CITIES, RadioCity, formatTime, frostOpening, cityClock } from '../../../../frost-agent/data/radio';
import { runFrost } from '../../../../frost-agent/harness/router';
import { RadioChat, ChatMsg } from './RadioChat';

type Mode = 'music' | 'podcast';

interface RadioStageProps {
  isOpen: boolean;
  onClose: () => void;
  startCitySlug?: string;          // 从城市播客点进来：定位到该城
  startTrackId?: string;           // 从音乐曲库点「放大」进来：定位到那座城 + 那首歌
  startMode?: Mode;                // 进入时的形态（播客入口给 'podcast'，音乐入口给 'music'）
  tourCities?: RadioCity[] | null; // 给定顺序则按此连续播放，否则全量（按时区）
}

export function RadioStage({ isOpen, onClose, startCitySlug, startTrackId, startMode = 'music', tourCities }: RadioStageProps) {
  const cities = tourCities && tourCities.length ? tourCities : RADIO_CITIES;
  const [cityIndex, setCityIndex] = useState(0);
  const [mode, setMode] = useState<Mode>(startMode);
  const [itemIndex, setItemIndex] = useState(0);
  const [intro, setIntro] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSec, setPlaySec] = useState(0);
  const [durSec, setDurSec] = useState(0);
  const [now, setNow] = useState(() => new Date(0));
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [djSec, setDjSec] = useState(0);
  const [djDur, setDjDur] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const bgAudioRef = useRef<HTMLAudioElement>(null);
  const djAudioRef = useRef<HTMLAudioElement>(null);
  const lastIntroIdRef = useRef<string | null>(null);
  const lastSegIdRef = useRef<string | null>(null);

  const city: RadioCity | undefined = cities[cityIndex];
  const hasPodcast = !!city && city.podcast.length > 0;
  const track = city && mode === 'music' ? city.tracks[itemIndex] : undefined;
  const segment = city && mode === 'podcast' ? city.podcast[itemIndex] : undefined;

  const queue = useMemo(() => {
    if (!city) return [];
    if (mode === 'music') return city.tracks.map((t) => ({ key: t.id }));
    return city.podcast.map((p) => ({ key: p.id }));
  }, [city, mode]);

  const audioUrl = track ? track.audioUrl : segment ? segment.audioUrl : '';
  const bgMusicUrl = mode === 'podcast' && segment && city ? (city.tracks[0]?.audioUrl || '') : '';

  const panelText = track ? `现在播放 ${track.title} — ${track.artist}`
    : segment ? `城市播客 · ${segment.title}` : '';

  // 字幕跟随：音乐开 DJ 时跟 DJ 声音；播客时整段稿子跟主音频进度逐字浮现
  const introTextTrim = track?.introText?.trim() || '';
  const segTextTrim = segment?.text?.trim() || '';
  const voiceSync = mode === 'music' && intro && introTextTrim
    ? { text: introTextTrim, progress: djDur > 0 ? Math.min(1, djSec / djDur) : 0 }
    : mode === 'podcast' && segTextTrim
    ? { text: segTextTrim, progress: durSec > 0 ? Math.min(1, playSec / durSec) : 0 }
    : null;

  // 进入 → 定位城市（音乐入口按曲目 id 定位到那座城 + 那首歌；播客入口按城市 slug）
  useEffect(() => {
    if (!isOpen) return;
    let ci = -1, ti = 0;
    if (startTrackId) {
      for (let k = 0; k < cities.length; k++) {
        const idx = cities[k].tracks.findIndex((t) => t.id === startTrackId);
        if (idx >= 0) { ci = k; ti = idx; break; }
      }
    }
    if (ci < 0 && startCitySlug) ci = cities.findIndex((c) => c.slug === startCitySlug);
    setCityIndex(ci >= 0 ? ci : 0);
    setItemIndex(ti);
    setMode(startMode);
    setIntro(false);
    setPlaySec(0); setDurSec(0);
    setIsPlaying(true);
    setMinimized(false);
  }, [isOpen, startCitySlug, startTrackId, startMode]);

  // 时钟
  useEffect(() => {
    if (!isOpen) return;
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [isOpen]);

  // 打开 / 切城市 → 重置对话为开场白
  useEffect(() => {
    if (!isOpen || !city) return;
    lastIntroIdRef.current = null;
    lastSegIdRef.current = null;
    // 播客：字幕直接用稿子，不放音乐电台开场白（避免与稿子叠成两条 FROST）
    setChat(mode === 'podcast' ? [] : [{ role: 'dj', text: frostOpening(new Date(), city), auto: true }]);
  }, [isOpen, cityIndex, mode]);

  // 换歌（音乐模式）→ 把这首歌的解说稿追加到对话（打字机自走）
  useEffect(() => {
    if (!isOpen || mode !== 'music') return;
    const tid = track?.id;
    if (!tid || tid === lastIntroIdRef.current) return;
    lastIntroIdRef.current = tid;
    const it = track?.introText?.trim();
    if (it) setChat((c) => [...c, { role: 'dj', text: it, auto: true }]);
  }, [isOpen, mode, track?.id]);

  // 进入播客段落 → 把这一集的稿子作为 FROST 字幕追加（随主音频进度逐字浮现，见 voiceSync）
  useEffect(() => {
    if (!isOpen || mode !== 'podcast') return;
    const sid = segment?.id;
    if (!sid || sid === lastSegIdRef.current) return;
    lastSegIdRef.current = sid;
    const st = segment?.text?.trim();
    if (st) setChat((c) => [...c, { role: 'dj', text: st, auto: true }]);
  }, [isOpen, mode, segment?.id]);

  // 换源 / 播放
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.src !== audioUrl) { audio.src = audioUrl; audio.load(); }
    if (isPlaying) audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }, [audioUrl, isPlaying]);

  useEffect(() => { if (!isOpen) { audioRef.current?.pause(); setIsPlaying(false); setMinimized(false); if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); } }, [isOpen]);

  // 播客背景乐：该城音乐低音量循环垫底
  useEffect(() => {
    const bg = bgAudioRef.current;
    if (!bg) return;
    if (!bgMusicUrl) { bg.pause(); return; }
    if (bg.src !== bgMusicUrl) { bg.src = bgMusicUrl; bg.load(); }
    bg.volume = 0.12;
    if (isPlaying && isOpen) bg.play().catch(() => {}); else bg.pause();
  }, [bgMusicUrl, isPlaying, isOpen]);

  // DJ 解说叠放（ducking）：解说声大、音乐压低做背景；说完音乐恢复
  const DUCK_VOL = 0.18;
  const djUrl = mode === 'music' && intro && track ? track.introAudioUrl : '';
  useEffect(() => {
    const main = audioRef.current;
    const dj = djAudioRef.current;
    if (!main) return;
    if (djUrl && dj) {
      if (dj.src !== djUrl) { dj.src = djUrl; dj.load(); dj.currentTime = 0; }
      dj.volume = 1;
      main.volume = DUCK_VOL;
      if (isPlaying && isOpen) dj.play().catch(() => {}); else dj.pause();
    } else {
      if (dj) dj.pause();
      main.volume = 1;
    }
  }, [djUrl, isPlaying, isOpen]);

  const curCover = track?.cover || city?.cover || '';
  const curCityZh = track?.cityNameZh || city?.cityNameZh || '';
  const curTz = track && track.tzOffset !== undefined
    ? { ianaTz: track.ianaTz ?? null, tzOffset: track.tzOffset }
    : (city ? { ianaTz: city.ianaTz, tzOffset: city.tzOffset } : { ianaTz: null, tzOffset: 0 });
  const localTime = useMemo(() => cityClock(now, curTz), [now, curTz.ianaTz, curTz.tzOffset]);

  const switchMode = (m: Mode) => { if (m === mode) return; setMode(m); setItemIndex(0); setIntro(false); setPlaySec(0); setDurSec(0); setIsPlaying(true); };
  const changeCity = (delta: number) => {
    const ni = (cityIndex + delta + cities.length) % cities.length;
    setCityIndex(ni); setItemIndex(0); setIntro(false); setMode('music'); setPlaySec(0); setDurSec(0);
  };
  const goItem = (delta: number) => {
    const ni = itemIndex + delta;
    if (ni < 0 || ni >= queue.length) return;
    setItemIndex(ni); setIntro(false); setIsPlaying(true);
  };
  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current; if (!audio || !durSec) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * durSec;
    setPlaySec(audio.currentTime);
  };
  const toggleDj = () => {
    if (mode !== 'music' || !track?.introAudioUrl) return;
    const turningOn = !intro;
    setIntro(turningOn);
    setIsPlaying(true);
    if (turningOn) {
      setDjSec(0);
      const dj = djAudioRef.current;
      if (dj) { try { dj.currentTime = 0; } catch { /* ignore */ } }
    }
  };
  const onDjEnded = () => setIntro(false);
  const onEnded = () => {
    // 音乐：这座城最后一首放完 → 切到下一座城从头继续
    if (mode === 'music' && itemIndex >= queue.length - 1) { changeCity(1); setIsPlaying(true); return; }
    goItem(1);
  };

  // frost 回答时穿插 TTS（端侧 Web Speech）：说话时把音乐压低，说完恢复（恢复到 DJ 态或正常音量）
  const speakTTS = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      const zh = window.speechSynthesis.getVoices().find((v) => /zh|Chinese|中文/i.test(v.lang) || /zh|Chinese|中文/i.test(v.name));
      if (zh) u.voice = zh;
      const main = audioRef.current;
      u.onstart = () => { if (main) main.volume = 0.15; };          // 压低城市音乐 / 播客背景
      const restore = () => { if (main) main.volume = intro ? DUCK_VOL : 1; };
      u.onend = restore; u.onerror = restore;
      window.speechSynthesis.speak(u);
    } catch { /* TTS 不可用则静默降级 */ }
  };
  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const history = chat.slice(-6).map((m) => ({ role: (m.role === 'dj' ? 'frost' : 'user') as 'user' | 'frost', text: m.text }));
    setChat((c) => [...c, { role: 'user', text }]);
    setChatInput('');
    setChatBusy(true);
    try {
      const res = await runFrost({ now: new Date(), citySlug: city?.slug, userText: text, history });
      if (res.reply) { setChat((c) => [...c, { role: 'dj', text: res.reply }]); speakTTS(res.reply); }
    } catch {
      setChat((c) => [...c, { role: 'dj', text: '我这边断了一下，再说一遍？' }]);
    } finally {
      setChatBusy(false);
    }
  };

  // 切城后若停在播客但新城无播客 → 回音乐
  useEffect(() => { if (mode === 'podcast' && !hasPodcast) setMode('music'); }, [mode, hasPodcast]);

  const miniTitle = track?.title || segment?.title || city?.cityNameZh || '';
  const miniSub = track?.artist || curCityZh;

  return (
    <>
      {isOpen && city && (
        <audio
          ref={audioRef}
          onTimeUpdate={(e) => setPlaySec(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDurSec(e.currentTarget.duration)}
          onEnded={onEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          style={{ display: 'none' }}
        />
      )}
      {isOpen && city && <audio ref={bgAudioRef} loop style={{ display: 'none' }} />}
      {isOpen && city && (
        <audio
          ref={djAudioRef}
          onEnded={onDjEnded}
          onTimeUpdate={(e) => setDjSec(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => { setDjDur(e.currentTarget.duration); setDjSec(0); }}
          style={{ display: 'none' }}
        />
      )}

      {/* 最小化迷你条（右下角，后台继续播放） */}
      <AnimatePresence>
        {isOpen && minimized && city && (
          <motion.div
            key="radio-mini"
            initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-4 right-4 z-[200] flex items-center gap-2.5 pl-2 pr-2.5 py-2 max-w-[300px] bg-[#0a0a0a] border-2 border-[#00ff88]/40 shadow-[3px_3px_0_rgba(0,0,0,0.6)] select-none"
          >
            <img src={curCover} alt={curCityZh} className="w-9 h-9 object-cover shrink-0 grayscale border border-[#00ff88]/30" referrerPolicy="no-referrer" />
            <div className="min-w-0 flex flex-col leading-tight">
              <span className="text-[11px] text-white truncate">{miniTitle}</span>
              <span className="font-pixel text-[6px] text-[#00ff88]/60 truncate tracking-wider uppercase mt-0.5">{curCityZh} · {miniSub}</span>
            </div>
            <button onClick={() => setIsPlaying((p) => !p)} className="w-7 h-7 border border-[#00ff88]/50 flex items-center justify-center text-[#00ff88] hover:bg-[#00ff88]/10 active:scale-95 shrink-0" aria-label="play/pause">
              {isPlaying ? <Pause size={13} fill="currentColor" strokeWidth={0} /> : <Play size={13} fill="currentColor" strokeWidth={0} className="ml-0.5" />}
            </button>
            <button onClick={() => setMinimized(false)} title="展开" className="w-7 h-7 flex items-center justify-center text-white/55 hover:text-[#00ff88] active:scale-95 shrink-0" aria-label="expand"><Maximize2 size={12} strokeWidth={2.2} /></button>
            <button onClick={onClose} title="关闭" className="w-7 h-7 flex items-center justify-center text-white/55 hover:text-[#00ff88] active:scale-95 shrink-0" aria-label="close"><X size={12} strokeWidth={2.2} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 全屏面板 */}
      <AnimatePresence>
        {isOpen && !minimized && city && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center select-none">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMinimized(true)} />
            <motion.div
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
              className="relative w-full max-w-[400px] h-[100dvh] sm:h-[680px] sm:max-h-[95vh] bg-[#0a0a0a] text-white flex flex-col overflow-hidden border-2 border-black shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
            >
              <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.04]" style={{ background: 'repeating-linear-gradient(0deg, #000, #000 1px, transparent 1px, transparent 2px)' }} />

              {/* HEADER */}
              <header className="h-10 flex items-center px-3 gap-2.5 bg-black z-10 shrink-0 border-b border-[#00ff88]/20">
                {/* 品牌（小） */}
                <span className="font-pixel text-[8px] tracking-[0.15em] text-[#00ff88]/80 shrink-0">FROST·RADIO</span>
                {/* 形态切换：紧凑分段开关 */}
                <div className="flex shrink-0 border border-[#00ff88]/30">
                  <button onClick={() => switchMode('music')} className={`px-2 py-[3px] font-pixel text-[6px] tracking-[0.15em] transition-colors ${mode === 'music' ? 'bg-[#00ff88] text-black' : 'text-white/45 hover:text-[#00ff88]'}`}>MUSIC</button>
                  {hasPodcast && (
                    <button onClick={() => switchMode('podcast')} className={`px-2 py-[3px] font-pixel text-[6px] tracking-[0.15em] border-l border-[#00ff88]/30 transition-colors ${mode === 'podcast' ? 'bg-[#00ff88] text-black' : 'text-white/45 hover:text-[#00ff88]'}`}>PODCAST</button>
                  )}
                </div>
                <span className="font-pixel text-[6px] tracking-widest text-red-500 animate-pulse shrink-0">● LIVE</span>
                <div className="flex-1" />
                {/* 城市 · 时间 */}
                <div className="flex flex-col items-end leading-none whitespace-nowrap shrink-0">
                  <span className="text-[10px] font-bold text-[#00ff88]">{curCityZh}</span>
                  <span className="text-[#00ff88]/80 font-bold text-[9px] mt-px tabular-nums">{localTime}</span>
                </div>
                {/* 关闭 / 最小化 */}
                <div className="flex flex-col items-center justify-center gap-px shrink-0">
                  <button onClick={onClose} title="关闭" aria-label="close radio" className="w-4 h-4 flex items-center justify-center text-white/45 hover:text-[#00ff88] active:scale-90 transition-all"><X size={11} strokeWidth={2.5} /></button>
                  <button onClick={() => setMinimized(true)} title="最小化（后台继续播放）" aria-label="minimize" className="w-4 h-4 flex items-center justify-center text-white/45 hover:text-[#00ff88] active:scale-90 transition-all"><Minus size={11} strokeWidth={2.5} /></button>
                </div>
              </header>

              {/* MAIN */}
              <div className="flex-1 flex flex-col min-h-0 p-3 gap-2 relative z-10 w-full overflow-y-auto overflow-x-hidden">
                {/* 封面卡 */}
                <div className="shrink-0 w-full flex flex-col items-center">
                  <div className="w-full max-w-[250px] mx-auto relative">
                    <button onClick={() => goItem(-1)} disabled={itemIndex === 0} className="absolute left-[-38px] top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center text-[#00ff88]/50 hover:text-[#00ff88] hover:scale-110 disabled:opacity-20 transition-all" aria-label="prev"><ChevronLeft size={30} strokeWidth={1.5} /></button>
                    <button onClick={() => goItem(1)} disabled={itemIndex >= queue.length - 1} className="absolute right-[-38px] top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center text-[#00ff88]/50 hover:text-[#00ff88] hover:scale-110 disabled:opacity-20 transition-all" aria-label="next"><ChevronRight size={30} strokeWidth={1.5} /></button>

                    <div className="relative w-full aspect-[4/5] bg-black overflow-hidden border-2 border-[#00ff88]/25 shadow-[0_20px_40px_rgba(0,0,0,0.5)]">
                      <img src={curCover} alt={curCityZh} className="absolute inset-0 w-full h-full object-cover grayscale" draggable={false} referrerPolicy="no-referrer" />
                      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
                      <div className="absolute left-3 right-3 bottom-2.5 text-left">
                        <div className="text-[17px] text-white font-bold leading-tight drop-shadow truncate">{track?.title || segment?.title || city.cityNameZh}</div>
                        <div className="font-pixel text-[7px] tracking-[0.22em] uppercase text-white/60 mt-1 truncate">{track?.artist || (segment ? `PODCAST · CH ${city.station.freq.toFixed(1)}` : `${city.station.name} ${city.station.freq.toFixed(1)}`)}</div>
                      </div>
                      <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                        <div className="w-1.5 h-1.5 bg-red-600 animate-pulse shadow-[0_0_4px_red]" />
                        <span className="font-pixel text-[6px] text-white tracking-widest drop-shadow">REC</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 进度 + 三按钮 + DJ */}
                <div className="w-full shrink-0 mt-3 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 font-pixel text-[7px] text-white/40 px-4">
                    <span className="tabular-nums w-8 text-right">{formatTime(playSec)}</span>
                    <div className="flex-1 h-[3px] bg-white/10 overflow-hidden cursor-pointer group" onClick={onSeek}>
                      <div className="h-full bg-[#00ff88]" style={{ width: `${durSec > 0 ? (playSec / durSec) * 100 : 0}%` }} />
                    </div>
                    <span className="tabular-nums w-8">{formatTime(durSec)}</span>
                  </div>

                  <div className="relative flex items-center justify-center gap-9">
                    <button onClick={() => changeCity(-1)} className="text-white/60 hover:text-[#00ff88] active:scale-90 transition-all" aria-label="prev city" title="上一座城市"><SkipBack size={18} strokeWidth={1.5} fill="currentColor" /></button>
                    <button onClick={() => setIsPlaying((p) => !p)} className="w-11 h-11 border-2 border-[#00ff88] flex items-center justify-center text-[#00ff88] hover:bg-[#00ff88]/10 active:scale-95 transition-all" aria-label="play/pause">
                      {isPlaying ? <Pause size={16} fill="currentColor" strokeWidth={0} /> : <Play size={16} fill="currentColor" strokeWidth={0} className="ml-0.5" />}
                    </button>
                    <button onClick={() => changeCity(1)} className="text-white/60 hover:text-[#00ff88] active:scale-90 transition-all" aria-label="next city" title="下一座城市"><SkipForward size={18} strokeWidth={1.5} fill="currentColor" /></button>
                    {mode === 'music' && track?.introAudioUrl && (
                      <button onClick={toggleDj} className={`absolute right-0 top-1/2 -translate-y-1/2 px-2.5 h-7 border-2 font-pixel text-[8px] font-bold tracking-wide transition-all active:scale-95 ${intro ? 'border-[#00ff88] bg-[#00ff88] text-black' : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88]/10'}`} title="让 DJ 介绍当前音乐（音乐压低、DJ 说话）">DJ</button>
                    )}
                  </div>
                </div>

                {/* 节目面板：恒显「现在播放 xxx」 */}
                <div className="shrink-0 mx-2 mt-2 px-3 py-1.5 border border-[#00ff88]/20 bg-[#00ff88]/[0.04]">
                  <div className="font-pixel text-[6px] uppercase tracking-[0.2em] text-[#00ff88]/50 mb-1">FROST · NOW PLAYING</div>
                  <div className="text-[11px] italic text-white/80 leading-snug line-clamp-3">{panelText}</div>
                </div>

                {/* 对话区（DJ 解说稿在此做字幕：开 DJ 随声音走，关 DJ 自走） */}
                <RadioChat chat={chat} chatInput={chatInput} onInputChange={setChatInput} onSend={sendChat} voiceSync={voiceSync} className="flex-1 w-full mt-3 px-2 relative z-10" />
              </div>

              {/* footer */}
              <div className="h-4 flex items-center justify-center shrink-0 mb-1 relative z-10">
                <span className="font-pixel text-[6px] uppercase tracking-[0.4em] opacity-40">{cities.length} CITIES · ALL NIGHT</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
