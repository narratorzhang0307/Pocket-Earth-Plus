import { useMemo, useReducer, useRef, useState, useEffect } from 'react';
import { ChevronLeft, Film, Plus, Camera, Star } from 'lucide-react';
import { movieRecords, movieTotal, movieMappedTotal, movieCountries, movieCountry, doubanRating, type MovieRecord } from '../data/movies';
import { addUserMark, getUserMarksByKind, subscribeUserMarks, spreadCoord } from '../data/userMarks';
import { httpEdge } from '../../../frost-agent/edge/httpEdge';
import { AnimatePresence } from 'motion/react';
import MarkerDetail, { type MarkerDetailData } from './MarkerDetail';

// movies-curator 运行页 —— 观影 agent。
// 1) 把豆瓣观影记录做成「电影票根」流；2) 用户记一笔/截图 → 端侧识别 → 实时钉到中间的地球（与 tab1 联动）。
// 和 obsidian 的区别：不是纯文本笔记，而是「票根 + 地球落点」，端侧模型负责从截图认片。

interface Props { onBack: () => void; embedded?: boolean }
const AMBER = '#ffb000';

interface Ticket {
  key: string; title: string; original?: string; director?: string;
  country: string; year?: number | null; rating?: number | null; type?: string; date?: string;
  synopsis?: string; douban?: number; pinned: boolean; user?: boolean;
}

const stars = (r?: number | null) => {
  const n = Math.max(0, Math.min(5, r || 0));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
};

function fromRecord(m: MovieRecord): Ticket {
  return { key: 'd' + m.id, title: m.title, original: m.original, director: m.director, country: m.country,
    year: m.year, rating: m.rating, type: m.type, date: m.date, synopsis: m.synopsis, douban: doubanRating(m.id), pinned: !!movieCountry(m.country) };
}

export default function MoviesRunPage({ onBack, embedded }: Props) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeUserMarks(force), []);

  const [title, setTitle] = useState('');
  const [country, setCountry] = useState('美国');
  const [year, setYear] = useState('');
  const [rating, setRating] = useState(4);
  const [toast, setToast] = useState<string | null>(null);
  const [vision, setVision] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<MarkerDetailData | null>(null);

  // 用户记录（带地球落点）→ 票根
  const userTickets: Ticket[] = getUserMarksByKind('movie').map((m) => {
    const meta = (m.meta || {}) as Record<string, unknown>;
    return { key: m.id, title: m.label || String(meta.title || ''), original: String(meta.original || ''),
      director: String(meta.director || ''), country: String(meta.country || ''), year: meta.year as number,
      rating: meta.rating as number, type: String(meta.type || '电影'), date: String(meta.date || ''), synopsis: String(meta.synopsis || ''), pinned: true, user: true };
  });

  // 豆瓣记录：按观看日期倒序，取近 60 条做票根流
  const recent: Ticket[] = useMemo(
    () => [...movieRecords].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 60).map(fromRecord),
    []
  );
  const feed = [...userTickets, ...recent];

  const countriesSeen = useMemo(() => new Set(movieRecords.map((m) => m.country).filter(Boolean)).size, []);
  const avg = useMemo(() => {
    const rs = movieRecords.map((m) => m.rating).filter((r): r is number => typeof r === 'number');
    return rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1) : '—';
  }, []);
  const onGlobe = movieMappedTotal + userTickets.length;

  const showToast = (s: string) => { setToast(s); window.setTimeout(() => setToast(null), 2200); };

  const addMovie = () => {
    const t = title.trim();
    if (!t) return;
    const base = movieCountry(country);
    const id = 'umv-' + Date.now();
    if (base) {
      const [lng, lat] = spreadCoord(id, base[0], base[1]);
      addUserMark({ id, kind: 'movie', lng, lat, label: t,
        meta: { title: t, country, year: year ? Number(year) : null, rating, type: '电影', date: new Date().toISOString().slice(0, 10) } });
      showToast(`已钉到地球 · ${country}`);
    } else {
      showToast('该国家暂无坐标，未落地球');
    }
    setTitle(''); setYear(''); setVision(null);
  };

  // 截图识别（端侧 Qwen-VL）：读图 → /api/edge vision；端侧未就绪时如实提示，可手动填写
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setVision('端侧识别中…');
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f);
      });
      const text = await httpEdge.vision(dataUrl, '这是一张电影信息截图，只回答电影的中文片名，不要其他文字。');
      if (text && text.trim()) {
        const guess = text.trim().split('\n')[0].slice(0, 40);
        setTitle(guess);
        setVision('端侧识别：' + guess);
      } else {
        setVision('端侧视觉模型未就绪（装好 Qwen-VL 后可从截图认片）· 可手动填写');
      }
    } catch {
      setVision('识别失败 · 可手动填写');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
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
            <div className="font-pixel text-[11px] tracking-wider truncate">MOVIES-CURATOR</div>
            <div className="text-[9px] text-black/45 truncate">观影 agent · {movieTotal} 部 · 票根钉地球</div>
          </div>
          <Film className="w-4 h-4" strokeWidth={2.5} style={{ color: AMBER }} />
        </div>
      )}

      {/* Stat strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black shrink-0" style={{ color: AMBER }}>
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>已观影 {movieTotal}</span><span className="opacity-40">|</span>
          <span>国家 {countriesSeen}</span><span className="opacity-40">|</span>
          <span>均分 {avg}</span><span className="opacity-40">|</span>
          <span>上地球 {onGlobe}</span>
        </div>
      </div>

      {/* 记一笔（落地球 + 截图识别） */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0 space-y-2">
        <div className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="记一部刚看完的电影…"
            onKeyDown={(e) => e.key === 'Enter' && addMovie()}
            className="flex-1 min-w-0 border-2 border-black px-2 py-1.5 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white" />
          <button onClick={() => fileRef.current?.click()} title="截图识别（端侧）"
            className="w-9 shrink-0 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
            <Camera className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
        <div className="flex gap-2 items-center">
          <select value={country} onChange={(e) => setCountry(e.target.value)}
            className="border-2 border-black px-1.5 py-1.5 text-[11px] bg-white max-w-[110px]">
            {movieCountries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="年份"
            className="w-14 border-2 border-black px-1.5 py-1.5 text-[11px] bg-white" />
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className="active:scale-90">
                <Star className="w-3.5 h-3.5" strokeWidth={2} fill={n <= rating ? AMBER : 'none'} style={{ color: AMBER }} />
              </button>
            ))}
          </div>
          <button onClick={addMovie} className="ml-auto flex items-center gap-1 border-2 border-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black" style={{ background: AMBER }}>
            <Plus className="w-3.5 h-3.5" strokeWidth={3} /> 钉地球
          </button>
        </div>
        {vision && <div className="text-[10px] text-black/55 leading-snug">⊙ {vision}</div>}
      </div>

      {/* 票根流 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {feed.map((t) => (
          <button key={t.key} onClick={() => setSelected({ kind: 'movie', title: t.title, original: t.original, director: t.director, country: t.country, year: t.year, rating: t.rating, date: t.date, synopsis: t.synopsis })} className="w-full text-left border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] bg-white relative overflow-hidden active:translate-y-px">
            {/* 票根顶部 amber 条 */}
            <div className="flex items-center justify-between px-2.5 py-1" style={{ background: AMBER }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">ADMIT ONE · 观影票根{t.user ? ' · NEW' : ''}</span>
              <span className="text-[10px] tracking-tight text-black/80">{stars(t.rating)}</span>
            </div>
            <div className="flex">
              <div className="flex-1 min-w-0 px-2.5 py-2">
                <div className="text-[13px] font-bold leading-tight truncate">{t.title}</div>
                {t.original && t.original !== t.title && (
                  <div className="font-pixel text-[7px] text-black/40 truncate mt-0.5">{t.original}</div>
                )}
                <div className="text-[10px] text-black/55 mt-1 truncate">
                  {[t.director, t.country, t.year].filter(Boolean).join(' · ')}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="w-2 h-2" style={{ background: t.pinned ? AMBER : '#bbb' }} />
                  <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                    {t.pinned ? `已钉 ${t.country || '—'}` : '未落地球'}{t.date ? ` · ${t.date}` : ''}
                  </span>
                </div>
              </div>
              {/* 撕票虚线 + 票根评分区（上：类型；下：豆瓣评分）*/}
              <div className="w-12 shrink-0 border-l-2 border-dashed border-black/40 flex flex-col items-center justify-center py-2">
                <span className="font-pixel text-[6px] text-black/40">{t.type || '电影'}</span>
                <span className="font-pixel text-[14px] leading-none mt-1" style={{ color: '#000' }}>{t.douban != null ? t.douban.toFixed(1) : '··'}</span>
              </div>
            </div>
          </button>
        ))}
        <div className="text-center text-[8px] font-pixel text-black/30 py-1 tracking-widest">
          票根来自豆瓣观影记录 · 端侧管「认片」· 落点钉地球
        </div>
      </div>

      {/* toast */}
      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50 border-2 border-black bg-black text-[11px] px-3 py-1.5 shadow-[2px_2px_0_#000]" style={{ color: AMBER }}>
          {toast}
        </div>
      )}

      {/* 点票根 → 和地球点开同款的票根详情（含 100 字简介）*/}
      <AnimatePresence>
        {selected && <MarkerDetail data={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
