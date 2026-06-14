import { useMemo, useReducer, useRef, useState, useEffect } from 'react';
import { ChevronLeft, BookOpen, Plus, Camera, Star } from 'lucide-react';
import { bookRecords, bookTotal, bookMappedTotal, bookCountry, BOOK_PLACES, bookPlace, type BookRecord } from '../data/books';
import { addUserMark, getUserMarksByKind, subscribeUserMarks, spreadCoord } from '../data/userMarks';
import { edgeSafe } from '../../../frost-agent/edge/contract';
import { recordSignals } from '../../../frost-agent/harness/profile';
import { AnimatePresence } from 'motion/react';
import MarkerDetail, { type MarkerDetailData } from './MarkerDetail';

// books-curator 运行页 —— 读书 agent。
// 1) 把豆瓣阅读记录做成「藏书票 EX LIBRIS」流；2) 用户记一本/截图认书 → 钉到「作者 / 故事之地」，与地球联动。
// 藏书票卡片显示一句话，点开 = 与地球点书点同款的紫色简介详情（≤100 字）。
// 和 obsidian 的区别：不是书目笔记，而是「书 → 地理 → 地球落点」；端侧模型从书封/书页截图认书。

interface Props { onBack: () => void; embedded?: boolean }
const VIOLET = '#b388ff';

interface Plate {
  key: string; title: string; author: string; place: string;
  year?: number | null; rating?: number | null; note?: string; synopsis?: string; date?: string; pinned?: boolean; user?: boolean;
}

const stars = (r?: number | null) => {
  const n = Math.max(0, Math.min(5, r || 0));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
};
// 卡片上的「一句话」：优先用户短评，否则取简介首句 / 截断
const oneLine = (p: Plate) => {
  if (p.note) return p.note;
  const s = (p.synopsis || '').trim();
  if (!s) return '';
  const head = s.split(/[。！？.!?]/)[0];
  const t = head && head.length <= 38 ? head : s.slice(0, 38);
  return t.length < s.length ? t + '…' : t;
};

function fromRecord(b: BookRecord): Plate {
  return { key: 'bk' + b.id, title: b.title, author: b.author, place: b.country,
    year: b.year, rating: b.rating, synopsis: b.synopsis, date: b.date, pinned: !!bookCountry(b.country) };
}

export default function BooksRunPage({ onBack, embedded }: Props) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeUserMarks(force), []);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [place, setPlace] = useState('上海');
  const [rating, setRating] = useState(4);
  const [toast, setToast] = useState<string | null>(null);
  const [vision, setVision] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<MarkerDetailData | null>(null);

  const userPlates: Plate[] = getUserMarksByKind('book').map((m) => {
    const meta = (m.meta || {}) as Record<string, unknown>;
    return { key: m.id, title: m.label || String(meta.title || ''), author: String(meta.author || ''),
      place: String(meta.place || ''), year: meta.year as number, rating: meta.rating as number,
      note: String(meta.note || ''), synopsis: String(meta.synopsis || ''), date: String(meta.date || ''), pinned: true, user: true };
  });

  // 豆瓣记录：按读完日期倒序，取近 60 本做藏书票流
  const recent: Plate[] = useMemo(
    () => [...bookRecords].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 60).map(fromRecord),
    []
  );
  const feed = [...userPlates, ...recent];

  const countriesSeen = useMemo(() => new Set(bookRecords.map((b) => b.country).filter(Boolean)).size, []);
  const onGlobe = bookMappedTotal + userPlates.length;

  const showToast = (s: string) => { setToast(s); window.setTimeout(() => setToast(null), 2200); };

  const openPlate = (p: Plate) => setSelected({ kind: 'book', title: p.title, author: p.author, place: p.place,
    year: p.year, rating: p.rating, synopsis: p.synopsis, date: p.date, note: p.note });

  const addBook = () => {
    const t = title.trim();
    if (!t) return;
    const p = bookPlace(place);
    const id = 'ubk-' + Date.now();
    if (p) {
      const [lng, lat] = spreadCoord(id, p.lng, p.lat, 0.5);
      addUserMark({ id, kind: 'book', lng, lat, label: t,
        meta: { title: t, author: author.trim(), place: p.name, rating, date: new Date().toISOString().slice(0, 10) } });
      if (author.trim()) recordSignals('books', { authors: [author.trim()] });  // 增量喂长期画像
      showToast(`已钉到地球 · ${p.name}`);
    } else {
      showToast('该地点暂无坐标');
    }
    setTitle(''); setAuthor(''); setVision(null);
  };

  // 截图认书（端侧 Qwen-VL）：读书封/书页 → /api/edge vision；未就绪时如实提示
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setVision('端侧识别中…');
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f);
      });
      const text = await edgeSafe.vision(dataUrl, '这是一张书封或书页截图，只回答书名，不要其他文字。');
      if (text && text.trim()) {
        const guess = text.trim().split('\n')[0].slice(0, 40);
        setTitle(guess); setVision('端侧识别：' + guess);
      } else {
        setVision('端侧视觉模型未就绪（装好 Qwen-VL 后可从书封认书）· 可手动填写');
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
            <div className="font-pixel text-[11px] tracking-wider truncate">BOOKS-CURATOR</div>
            <div className="text-[9px] text-black/45 truncate">读书 agent · {bookTotal} 本 · 藏书票钉地球</div>
          </div>
          <BookOpen className="w-4 h-4" strokeWidth={2.5} style={{ color: VIOLET }} />
        </div>
      )}

      {/* Stat strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black shrink-0" style={{ color: VIOLET }}>
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>读过 {bookTotal}</span><span className="opacity-40">|</span>
          <span>国家 {countriesSeen}</span><span className="opacity-40">|</span>
          <span>上地球 {onGlobe}</span>
        </div>
      </div>

      {/* 记一本（落地球 + 截图认书） */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0 space-y-2">
        <div className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="记一本刚读完的书…"
            onKeyDown={(e) => e.key === 'Enter' && addBook()}
            className="flex-1 min-w-0 border-2 border-black px-2 py-1.5 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white" />
          <button onClick={() => fileRef.current?.click()} title="截图认书（端侧）"
            className="w-9 shrink-0 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
            <Camera className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
        <div className="flex gap-2 items-center">
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="作者"
            className="w-20 border-2 border-black px-1.5 py-1.5 text-[11px] bg-white" />
          <select value={place} onChange={(e) => setPlace(e.target.value)}
            className="border-2 border-black px-1.5 py-1.5 text-[11px] bg-white max-w-[120px]">
            {BOOK_PLACES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className="active:scale-90">
                <Star className="w-3.5 h-3.5" strokeWidth={2} fill={n <= rating ? VIOLET : 'none'} style={{ color: VIOLET }} />
              </button>
            ))}
          </div>
          <button onClick={addBook} className="ml-auto flex items-center gap-1 border-2 border-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black" style={{ background: VIOLET }}>
            <Plus className="w-3.5 h-3.5" strokeWidth={3} /> 钉地球
          </button>
        </div>
        {vision && <div className="text-[10px] text-black/55 leading-snug">⊙ {vision}</div>}
      </div>

      {/* 藏书票流（点开 = 紫色 100 字简介，与地球点书点同款）*/}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {feed.map((p) => {
          const line = oneLine(p);
          return (
            <button key={p.key} onClick={() => openPlate(p)} className="w-full text-left border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] bg-white active:translate-y-px">
              {/* EX LIBRIS 顶条 */}
              <div className="flex items-center justify-between px-2.5 py-1 border-b-2" style={{ borderColor: VIOLET }}>
                <span className="font-pixel text-[7px] tracking-widest" style={{ color: '#7a4dd6' }}>EX LIBRIS · 藏书票{p.user ? ' · NEW' : ''}</span>
                <span className="text-[10px] tracking-tight" style={{ color: '#7a4dd6' }}>{p.rating ? stars(p.rating) : ''}</span>
              </div>
              <div className="px-2.5 py-2">
                <div className="flex items-baseline gap-2">
                  <div className="text-[14px] font-bold leading-tight truncate">{p.title}</div>
                  {p.year && <span className="font-pixel text-[7px] text-black/35 shrink-0">{p.year}</span>}
                </div>
                <div className="text-[10px] text-black/55 mt-0.5 truncate">{[p.author, p.place].filter(Boolean).join(' · ')}</div>
                {line && <div className="text-[11px] text-black/70 mt-1.5 leading-snug italic line-clamp-2">「{line}」</div>}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="w-2 h-2" style={{ background: p.pinned ? VIOLET : '#bbb' }} />
                  <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                    {p.pinned ? `已钉 ${p.place || '故事之地'}` : '未落地球'}{p.date ? ` · 读于 ${p.date}` : ''}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
        <div className="text-center text-[8px] font-pixel text-black/30 py-1 tracking-widest">
          藏书票来自豆瓣阅读记录 · 端侧管「认书」· 落点钉地球
        </div>
      </div>

      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50 border-2 border-black bg-black text-[11px] px-3 py-1.5 shadow-[2px_2px_0_#000]" style={{ color: VIOLET }}>
          {toast}
        </div>
      )}

      {/* 点藏书票 → 和地球点书点同款的紫色简介详情（≤100 字）*/}
      <AnimatePresence>
        {selected && <MarkerDetail data={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
