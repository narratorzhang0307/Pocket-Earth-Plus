import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { removeTripMarks, type TripView } from '../lib/travel';
import { removeUserMark } from '../data/userMarks';

// 地球标记点击后的详情弹层：按类型渲染（照片灯箱 / 电影票根 / 藏书票 / 行程足迹 / 音乐城市）。
// 详情数据由 MyMapTab 点击时从查找表(mapMarkers / userMarks)取出后传入。

export interface MarkerDetailData {
  kind: 'photo' | 'movie' | 'book' | 'travel' | 'music' | 'council' | 'custom';
  markId?: string;          // 用户落点 id（travel 足迹等可撤销内容用）
  // 通用
  title?: string;
  // photo
  full?: string; thumb?: string; city?: string;
  // movie
  original?: string; director?: string; country?: string; year?: number | null; rating?: number | null; date?: string; synopsis?: string; type?: string;
  cast?: string[]; genre?: string; movement?: string; geoKind?: string;   // 电影 agent 补全的多维标签 + 落点精度
  // book
  author?: string; place?: string; note?: string; translator?: string;
  // travel
  tag?: string; tripId?: string; trip?: TripView;
  // council（议事裁决）
  verdict?: string; confidence?: number; ruleEstablished?: string;
  // custom（用户自建 agent 的落点 · 通用渲染）
  agentName?: string; emoji?: string; domain?: string; color?: string; tags?: Record<string, string>;
  // 星球照片署名（Unsplash 合规）
  authorName?: string; authorLink?: string; photoLink?: string;
}

const UTM = 'utm_source=pocket_earth&utm_medium=referral';
const withUtm = (u?: string) => (u ? u + (u.includes('?') ? '&' : '?') + UTM : '');

const onImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.opacity = '0'; };
const stars = (r?: number | null) => {
  const n = Math.max(0, Math.min(5, r || 0));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
};

export default function MarkerDetail({ data, onClose, onRemove }: { data: MarkerDetailData; onClose: () => void; onRemove?: (id: string) => void }) {
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
              {data.authorName ? (
                <div className="text-[10px] text-black/45 mt-0.5">
                  Photo by <a href={withUtm(data.authorLink)} target="_blank" rel="noopener noreferrer" className="underline">{data.authorName}</a> on <a href={withUtm(data.photoLink)} target="_blank" rel="noopener noreferrer" className="underline">Unsplash</a>
                </div>
              ) : (
                <div className="text-[10px] text-black/45 mt-0.5">● 已钉地球 · LOC_SYNC</div>
              )}
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
              {/* 电影 agent 补全的多维标签 */}
              {(data.genre || data.movement || (data.cast && data.cast.length)) && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {data.genre && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">类型·{data.genre}</span>}
                  {data.movement && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#fff0d6]">流派·{data.movement}</span>}
                  {(data.cast || []).slice(0, 3).map((c, i) => <span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">{c}</span>)}
                </div>
              )}
              {data.synopsis && <div className="text-[11px] text-black/70 leading-relaxed mt-2 max-h-[160px] overflow-y-auto">{data.synopsis}</div>}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-2 h-2" style={{ background: '#ffb000' }} />
                <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                  钉于 {data.geoKind === 'filming' ? '取景地' : data.geoKind === 'story' ? '故事地' : ''}{data.place || data.country || '—'}{data.date ? ` · 观看 ${data.date}` : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 藏书票 */}
        {data.kind === 'book' && (
          <div>
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b-2" style={{ borderColor: '#b388ff' }}>
              <span className="font-pixel text-[7px] tracking-widest" style={{ color: '#7a4dd6' }}>EX LIBRIS · 藏书票</span>
              {data.rating != null && <span className="text-[11px] tracking-tight" style={{ color: '#7a4dd6' }}>{stars(data.rating)}</span>}
            </div>
            <div className="px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <div className="text-[15px] font-bold leading-tight">{data.title}</div>
                {data.year && <span className="font-pixel text-[8px] text-black/35">{data.year}</span>}
              </div>
              <div className="text-[11px] text-black/60 mt-1">{[data.author, data.country].filter(Boolean).join(' · ')}</div>
              {/* 读书 agent 补全的多维标签 */}
              {(data.genre || data.movement || data.translator) && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {data.genre && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">类型·{data.genre}</span>}
                  {data.movement && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#f3ecff]">流派·{data.movement}</span>}
                  {data.translator && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EFE9FA]">译·{data.translator}</span>}
                </div>
              )}
              {data.synopsis && <div className="text-[11px] text-black/75 leading-relaxed mt-2 max-h-[160px] overflow-y-auto">{data.synopsis}</div>}
              {!data.synopsis && data.note && <div className="text-[12px] text-black/75 leading-relaxed mt-2 italic">「{data.note}」</div>}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-2 h-2" style={{ background: '#b388ff' }} />
                <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                  钉于 {data.geoKind === 'story' ? '故事地' : data.geoKind === 'author' ? '作者地' : ''}{data.place || '故事之地'}{data.date ? ` · 读于 ${data.date}` : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 行程整程卡：同一趟旅程的多个停留点聚合（截图提炼 / 规划完成的整趟） */}
        {data.kind === 'travel' && data.trip && (
          <div>
            <div className="px-2.5 py-1.5" style={{ background: '#ff3b6b' }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">JOURNEY · 整趟行程</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[15px] font-bold leading-tight">{data.trip.title}</div>
              <div className="text-[11px] text-black/55 mt-1">
                {data.trip.dateStart ? `${data.trip.dateStart}${data.trip.dateEnd && data.trip.dateEnd !== data.trip.dateStart ? `~${data.trip.dateEnd}` : ''} · ` : ''}
                途经 {data.trip.cities.join('、')}
              </div>
              <div className="mt-2 space-y-1 max-h-[180px] overflow-y-auto">
                {data.trip.stops.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-4 h-4 shrink-0 border border-black flex items-center justify-center font-pixel text-[7px]" style={{ background: '#ff3b6b' }}>{i + 1}</span>
                    <span className="font-bold truncate">{s.label}</span>
                    {s.city && s.city !== s.label && <span className="text-black/45 text-[10px] truncate">· {s.city}</span>}
                    {s.date && <span className="text-black/35 text-[9px] ml-auto shrink-0">{s.date}</span>}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-1.5 mt-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2" style={{ background: '#ff3b6b' }} />
                  <span className="font-pixel text-[7px] text-black/50 tracking-wider">{data.trip.stops.length} 个停留 · 已连成轨迹</span>
                </div>
                <button onClick={() => { removeTripMarks(data.trip!.tripId, removeUserMark); onClose(); }}
                  className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white text-[#d23b3b] active:translate-y-px">移除整趟</button>
              </div>
            </div>
          </div>
        )}

        {/* 行程足迹（单点：手动录入一笔 / 旧数据无 tripId） */}
        {data.kind === 'travel' && !data.trip && (
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
              <div className="flex items-center justify-between gap-1.5 mt-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2" style={{ background: '#ff3b6b' }} />
                  <span className="font-pixel text-[7px] text-black/50 tracking-wider">{data.date ? `走过 · ${data.date}` : '已钉星球'}</span>
                </div>
                {data.markId && onRemove && (
                  <button onClick={() => { onRemove(data.markId!); onClose(); }}
                    className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white text-[#d23b3b] active:translate-y-px">移除足迹</button>
                )}
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

        {/* 议事裁决（法庭/圆桌的庭审纪要） */}
        {data.kind === 'council' && (
          <div>
            <div className="px-2.5 py-1.5" style={{ background: '#caa64a' }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">VERDICT · 庭审纪要</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[14px] font-bold leading-tight">⚖️ {data.title}</div>
              {data.verdict && <div className="text-[12px] text-black/75 leading-relaxed mt-2">{data.verdict}</div>}
              {data.ruleEstablished && <div className="text-[11px] text-black/60 italic mt-2 border-l-2 pl-2" style={{ borderColor: '#caa64a' }}>裁判要旨：{data.ruleEstablished}</div>}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-2 h-2" style={{ background: '#caa64a' }} />
                <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                  {data.place ? `就此地开庭 · ${data.place}` : '议事裁决'}{typeof data.confidence === 'number' ? ` · 置信 ${Math.round(data.confidence * 100)}%` : ''}{data.date ? ` · ${data.date}` : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 自建 agent 落点（通用：一个分支覆盖所有用户自造的 agent，地球不认识具体哪个） */}
        {data.kind === 'custom' && (
          <div>
            <div className="px-2.5 py-1.5" style={{ background: data.color || '#ff8a3d' }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">{(data.agentName || '自建 AGENT').toUpperCase()}</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[15px] font-bold leading-tight">{data.emoji || '📍'} {data.title}</div>
              {data.note && <div className="text-[12px] text-black/75 leading-relaxed mt-1.5">{data.note}</div>}
              {data.tags && Object.keys(data.tags).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(data.tags).map(([k, v]) => (
                    <span key={k} className="text-[9px] border border-black px-1.5 py-0.5 bg-[#f6f6f6]">{k}：{v}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-2 h-2" style={{ background: data.color || '#ff8a3d' }} />
                <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                  {data.domain ? `${data.domain}` : '自建'}{data.place ? ` · ${data.place}` : ''}{data.date ? ` · ${data.date}` : ''}
                </span>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
