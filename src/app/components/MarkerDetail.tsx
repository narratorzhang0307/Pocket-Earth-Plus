import { X } from 'lucide-react';
import { motion } from 'motion/react';

// 地球标记点击后的详情弹层：按类型渲染（照片灯箱 / 电影票根 / 藏书票 / 行程足迹 / 音乐城市）。
// 详情数据由 MyMapTab 点击时从查找表(mapMarkers / userMarks)取出后传入。

export interface MarkerDetailData {
  kind: 'photo' | 'movie' | 'book' | 'travel' | 'music';
  // 通用
  title?: string;
  // photo
  full?: string; thumb?: string; city?: string;
  // movie
  original?: string; director?: string; country?: string; year?: number | null; rating?: number | null; date?: string; synopsis?: string; type?: string;
  // book
  author?: string; place?: string; note?: string;
  // travel
  tag?: string;
}

const onImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.opacity = '0'; };
const stars = (r?: number | null) => {
  const n = Math.max(0, Math.min(5, r || 0));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
};

export default function MarkerDetail({ data, onClose }: { data: MarkerDetailData; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        className="w-[300px] max-w-full bg-white border-[3px] border-black shadow-[6px_6px_0_#000] relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute -top-3 -right-3 w-7 h-7 bg-black border-2 border-[#7CFF6B] flex items-center justify-center z-10">
          <X className="w-3.5 h-3.5 text-[#7CFF6B]" strokeWidth={3} />
        </button>

        {/* 照片灯箱 */}
        {data.kind === 'photo' && (
          <div className="p-2">
            <div className="w-full aspect-square bg-[#d8d8d6] border border-black overflow-hidden">
              <img src={data.full || data.thumb} onError={onImgErr} alt={data.city} className="w-full h-full object-cover" />
            </div>
            <div className="py-2 text-center">
              <div className="font-pixel text-[9px] tracking-widest">{data.city || '照片'}</div>
              <div className="text-[10px] text-black/45 mt-0.5">● 已钉地球 · LOC_SYNC</div>
            </div>
          </div>
        )}

        {/* 电影票根 */}
        {data.kind === 'movie' && (
          <div>
            <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: '#ffb000' }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">ADMIT ONE · 观影票根</span>
              <span className="text-[11px] text-black/80">{stars(data.rating)}</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[15px] font-bold leading-tight">{data.title}</div>
              {data.original && data.original !== data.title && <div className="font-pixel text-[8px] text-black/40 mt-1">{data.original}</div>}
              <div className="text-[11px] text-black/60 mt-1.5">{[data.director, data.country, data.year].filter(Boolean).join(' · ')}</div>
              {data.synopsis && <div className="text-[11px] text-black/70 leading-relaxed mt-2 max-h-[160px] overflow-y-auto">{data.synopsis}</div>}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-2 h-2" style={{ background: '#ffb000' }} />
                <span className="font-pixel text-[7px] text-black/50 tracking-wider">已钉 {data.country || '—'}{data.date ? ` · 观看 ${data.date}` : ''}</span>
              </div>
            </div>
          </div>
        )}

        {/* 藏书票 */}
        {data.kind === 'book' && (
          <div>
            <div className="px-2.5 py-1.5 border-b-2" style={{ borderColor: '#b388ff' }}>
              <span className="font-pixel text-[7px] tracking-widest" style={{ color: '#7a4dd6' }}>EX LIBRIS · 藏书票</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <div className="text-[15px] font-bold leading-tight">{data.title}</div>
                {data.year && <span className="font-pixel text-[8px] text-black/35">{data.year}</span>}
              </div>
              <div className="text-[11px] text-black/55 mt-1">{data.author}</div>
              {data.note && <div className="text-[12px] text-black/75 leading-relaxed mt-2 italic">「{data.note}」</div>}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-2 h-2" style={{ background: '#b388ff' }} />
                <span className="font-pixel text-[7px] text-black/50 tracking-wider">已钉 {data.place || '故事之地'}</span>
              </div>
            </div>
          </div>
        )}

        {/* 行程足迹 */}
        {data.kind === 'travel' && (
          <div>
            <div className="px-2.5 py-1.5" style={{ background: '#ff3b6b' }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">FOOTPRINT · 私人足迹</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <div className="text-[15px] font-bold leading-tight">{data.title}</div>
                {data.tag && <span className="font-pixel text-[7px] border border-black/40 px-1 text-black/60">{data.tag}</span>}
              </div>
              <div className="text-[11px] text-black/55 mt-1">{data.city}</div>
              {data.note && <div className="text-[12px] text-black/75 leading-relaxed mt-2">{data.note}</div>}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-2 h-2" style={{ background: '#ff3b6b' }} />
                <span className="font-pixel text-[7px] text-black/50 tracking-wider">{data.date ? `走过 · ${data.date}` : '已钉星球'}</span>
              </div>
            </div>
          </div>
        )}

        {/* 音乐城市 */}
        {data.kind === 'music' && (
          <div>
            <div className="px-2.5 py-1.5 bg-black"><span className="font-pixel text-[7px] tracking-widest text-[#00ff88]">CITY · 音乐城市</span></div>
            <div className="px-3 py-3 text-center">
              <div className="text-[16px] font-bold">{data.title || data.city}</div>
              <div className="text-[10px] text-black/45 mt-1">● 歌手出身地 / 歌曲城市</div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
