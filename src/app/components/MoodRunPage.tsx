import { useReducer, useState, useEffect } from 'react';
import { ChevronLeft, MapPin, X } from 'lucide-react';
import { getMoodStickers, addMoodSticker, removeMoodSticker, subscribeMood, resolveMoodPlace, randomPlace, pickStickerColor, pickRot } from '../data/geoStickers';

// mood-curator 运行页 —— 心绪 · 漫游。
// 记录你在全世界各地「赛博浏览」时的心情：写一句 → 端侧判地名 → 钉到地图对应经纬度（与地球同一份 store）。
// 没判出地名就随机落到一座城市，让心情散落全球。

interface Props { onBack: () => void }
const ACCENT = '#ffd23b';

export default function MoodRunPage({ onBack }: Props) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeMood(force), []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const stickers = getMoodStickers();
  const cities = new Set(stickers.map((s) => s.place)).size;

  // 钉下：端侧判地名 → 落那里；判不出就落「此处」(当前中心)，不再静默瞬移到随机城市
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await resolveMoodPlace(t, [120.14, 30.24]);
    const id = 'mood-' + Date.now();
    addMoodSticker({ id, lat: r.lat, lng: r.lng, text: t, place: r.place, color: pickStickerColor(t), rot: pickRot(id) });
    setText(''); setBusy(false);
  };

  // 随机漫游：用户主动选择把心情甩到地球某处，且贴纸标注「随机落点」非你所指
  const submitRandom = () => {
    const t = text.trim();
    if (!t || busy) return;
    const rp = randomPlace();
    const id = 'mood-' + Date.now();
    addMoodSticker({ id, lat: rp.lat, lng: rp.lng, text: t, place: `${rp.place} · 随机落点`, color: pickStickerColor(t), rot: pickRot(id) });
    setText('');
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">MOOD-CURATOR</div>
        </div>
        <MapPin className="w-4 h-4" strokeWidth={2.5} style={{ color: '#caa400' }} />
      </div>

      {/* Stat strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black shrink-0" style={{ color: ACCENT }}>
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>心情 {stickers.length}</span><span className="opacity-40">|</span>
          <span>落点 {cities} 处</span><span className="opacity-40">|</span>
          <span>端侧判地名 · 钉地图</span>
        </div>
      </div>

      {/* 写心情 */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0 space-y-2">
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={2}
          placeholder="此刻在世界某处的心情…（带个地名会更准）"
          className="w-full border-2 border-black px-2.5 py-2 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white resize-none"
        />
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-black/45 leading-snug flex-1">端侧判出地名就钉那里；判不出落「此处」，或点骰子随机漫游一处</span>
          <button onClick={submitRandom} disabled={busy || !text.trim()} title="随机漫游到一处"
            className="border-2 border-black px-2 py-1.5 text-[12px] bg-white shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-40">🎲</button>
          <button onClick={submit} disabled={busy || !text.trim()}
            className="flex items-center gap-1 border-2 border-black px-3 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-40" style={{ background: ACCENT }}>
            {busy ? '识别中…' : '钉下 ◍'}
          </button>
        </div>
      </div>

      {/* 心情列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {stickers.length === 0 && (
          <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_rgba(0,0,0,0.85)] text-center">
            <MapPin className="w-6 h-6 mx-auto mb-2" strokeWidth={2} style={{ color: '#caa400' }} />
            <div className="text-[12px] font-bold mb-1">还没有心情贴</div>
            <div className="text-[11px] text-black/55 leading-snug">写一句此刻的心情，它会钉到世界地图上对应的地方，在中间的地球上也能看到。</div>
          </div>
        )}
        {stickers.map((s) => (
          <div key={s.id} className="relative border-2 border-black shadow-[2px_3px_0_rgba(0,0,0,0.55)] px-3 py-2.5" style={{ background: s.color, transform: `rotate(${s.rot * 0.4}deg)` }}>
            <span className="absolute -top-2 left-4 w-3 h-3 rounded-full bg-[#ff00ff] border-2 border-black" />
            <div className="text-[12px] leading-snug text-black font-medium break-words pr-5">{s.text}</div>
            <div className="font-pixel text-[7px] text-black/55 tracking-wider mt-1.5">◍ {s.place} · {s.createdAt.slice(0, 10)}</div>
            <button onClick={() => removeMoodSticker(s.id)} className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center text-black/40 hover:text-[#d23b3b] active:translate-y-px">
              <X className="w-3.5 h-3.5" strokeWidth={3} />
            </button>
          </div>
        ))}
        {stickers.length > 0 && <div className="text-center text-[8px] font-pixel text-black/30 py-1 tracking-widest">心情贴与中间地球同一份 · 缩放不跟跑</div>}
      </div>
    </div>
  );
}
