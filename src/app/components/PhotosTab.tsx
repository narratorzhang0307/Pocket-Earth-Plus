import { useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { timelineGroups, calendarPhotos, magazineYears, hasPhotos } from '../data/photos';

// 照片 tab —— 同一批照片以「时间 / 日历 / 杂志」三种方式分布。
// 数据全部来自解耦的 photos 数据源（换照片只换数据源，这里不动）。

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const SEGMENTS = ['时间', '日历', '杂志'] as const;
type Segment = (typeof SEGMENTS)[number];
type Lightbox = { img: string; caption: string; sub?: string };

// OSS 图片加载失败时优雅降级：隐藏失败图，露出父级灰底占位
const onImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.opacity = '0'; };

const litDays = Object.keys(calendarPhotos).length;

export default function PhotosTab() {
  const [segment, setSegment] = useState<Segment>('日历');
  const [lightbox, setLightbox] = useState<Lightbox | null>(null);
  const [openYear, setOpenYear] = useState<number | null>(null);

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans relative overflow-hidden">
      {/* 顶栏状态 */}
      <div className="flex justify-between items-center px-4 py-2 border-b-2 border-black bg-[#EAEAEA] shrink-0">
        <div className="font-pixel text-[8px] uppercase">Connection: Secure</div>
        <div className="font-pixel text-[8px] text-[#00aa55]">SYS.ONLINE</div>
      </div>

      {/* 标题 */}
      <div className="px-4 py-4 border-b-2 border-black bg-white shrink-0">
        <h1 className="font-pixel text-xl uppercase tracking-wider mb-2">PHOTOS</h1>
        <p className="text-xs text-black/70 tracking-wide font-medium">
          按时间 / 日历 / 杂志整理你的照片。<br />
          <span className="opacity-60 text-[9px] font-pixel block mt-1">Your moments, three ways.</span>
        </p>
      </div>

      {/* 分段切换 */}
      <div className="px-4 py-3 border-b-2 border-black bg-white flex justify-center z-10 shrink-0">
        <div className="flex border-2 border-black bg-[#EAEAEA] p-1 w-full max-w-[280px]">
          {SEGMENTS.map((s) => (
            <button
              key={s}
              onClick={() => setSegment(s)}
              className={`flex-1 py-1.5 text-[11px] font-bold text-center transition-all ${
                segment === s ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {!hasPhotos ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-2 py-16">
            <div className="font-pixel text-[10px] text-black/40 tracking-widest uppercase">照片库为空</div>
            <div className="text-[11px] text-black/40 leading-relaxed">资料库未加载（resource-library/world-photos.json）。</div>
          </div>
        ) : (
          <>
            {/* —— 时间：日期分组的 Polaroid 堆 —— */}
            {segment === '时间' && (
              <div className="px-4 pt-4 pb-6 flex flex-col gap-7">
                {timelineGroups.map((g) => (
                  <div key={g.id}>
                    <div className="mb-2.5 flex items-baseline gap-2 pl-1">
                      <h2 className={`font-pixel text-[12px] ${g.special ? 'text-[#00aa55]' : 'text-black'}`}>{g.title}</h2>
                      {g.sub && <span className="text-[11px] text-black/45">· {g.sub}</span>}
                    </div>
                    <div className="flex flex-row items-end pl-1">
                      {g.photos.map((p, idx) => (
                        <motion.button
                          key={p.id}
                          style={{ rotate: p.rot, marginLeft: idx === 0 ? 0 : -26 }}
                          whileHover={{ scale: 1.06, rotate: 0, y: -6, zIndex: 50 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setLightbox({ img: p.full, caption: p.cap })}
                          className="relative bg-white p-1.5 pb-4 border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] w-[92px] shrink-0 origin-bottom"
                        >
                          <div className="w-full aspect-square bg-[#d8d8d6] border border-black/30 overflow-hidden">
                            <img src={p.img} onError={onImgErr} alt={p.cap} className="w-full h-full object-cover grayscale contrast-125" />
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* —— 日历：月份网格 —— */}
            {segment === '日历' && (
              <div className="px-4 pt-4 pb-6">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-pixel text-base tracking-wider">2025.06</h2>
                  <div className="flex gap-1.5">
                    <button className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
                      <ChevronLeft className="w-3.5 h-3.5 text-black" strokeWidth={3} />
                    </button>
                    <button className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
                      <ChevronLeft className="w-3.5 h-3.5 text-black rotate-180" strokeWidth={3} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {WEEK.map((d) => (
                    <div key={d} className="text-center font-pixel text-[7px] text-black/45">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {DAYS.map((day) => {
                    const p = calendarPhotos[day];
                    if (p) {
                      return (
                        <button
                          key={day}
                          onClick={() => setLightbox({ img: p.full, caption: `JUNE ${day}, 2025`, sub: `${p.count} 张 · LOC_SYNC` })}
                          className="aspect-square relative overflow-hidden border-2 border-black shadow-[1px_1px_0_#000] active:translate-y-px bg-[#d8d8d6]"
                        >
                          <img src={p.thumb} onError={onImgErr} alt={`June ${day}`} className="w-full h-full object-cover grayscale contrast-125" />
                          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />
                          <span className="absolute top-0.5 left-1 font-pixel text-[8px] text-[#7CFF6B] leading-none z-10">{day}</span>
                          {p.count > 1 && (
                            <div className="absolute top-0.5 right-0.5 bg-black border border-[#7CFF6B] px-1 z-10">
                              <span className="font-pixel text-[6px] text-[#7CFF6B] leading-none">{p.count}</span>
                            </div>
                          )}
                        </button>
                      );
                    }
                    return (
                      <div key={day} className="aspect-square relative border border-black/20 bg-[#E2E2E0]">
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-pixel text-[8px] text-black/35">{day}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 text-center font-pixel text-[8px] text-black/30 tracking-widest">
                  {litDays} DAYS LIT
                </div>
              </div>
            )}

            {/* —— 杂志：年份相册书 → 翻开看那年照片 —— */}
            {segment === '杂志' && (
              openYear == null ? (
                <div className="px-4 pt-4 pb-6 flex flex-col gap-3">
                  {magazineYears.map((y) => (
                    <button
                      key={y.year}
                      onClick={() => setOpenYear(y.year)}
                      className="relative h-32 border-2 border-black shadow-[3px_3px_0_#000] overflow-hidden active:translate-y-px text-left bg-[#d8d8d6]"
                    >
                      <img src={y.cover} onError={onImgErr} className="w-full h-full object-cover grayscale contrast-125" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                      <div className="absolute top-2 left-3 font-pixel text-2xl text-[#7CFF6B] drop-shadow-[2px_2px_0_#000]">{y.year}</div>
                      <div className="absolute bottom-2 left-3 font-pixel text-[7px] text-white/85 tracking-widest">翻开 ▶</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 pt-3 pb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => setOpenYear(null)} className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
                      <ChevronLeft className="w-3.5 h-3.5" strokeWidth={3} />
                    </button>
                    <h2 className="font-pixel text-base tracking-wider">{openYear} 相册</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {magazineYears.find((y) => y.year === openYear)!.photos.map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => setLightbox({ img: p.full, caption: `${openYear} · #${i + 1}` })}
                        className="aspect-square border-2 border-black overflow-hidden shadow-[1px_1px_0_#000] active:translate-y-px bg-[#d8d8d6]"
                      >
                        <img src={p.thumb} onError={onImgErr} className="w-full h-full object-cover grayscale contrast-125" />
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* Lightbox（三视图共用） */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="w-[300px] bg-white border-[3px] border-black shadow-[6px_6px_0_#000] p-2 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setLightbox(null)}
                className="absolute -top-3 -right-3 w-7 h-7 bg-black border-2 border-[#7CFF6B] flex items-center justify-center z-10"
              >
                <X className="w-3.5 h-3.5 text-[#7CFF6B]" strokeWidth={3} />
              </button>
              <div className="w-full aspect-square bg-[#d8d8d6] border border-black overflow-hidden">
                <img src={lightbox.img} onError={onImgErr} alt={lightbox.caption} className="w-full h-full object-cover grayscale contrast-125" />
              </div>
              <div className="py-2 text-center">
                <div className="font-pixel text-[9px] tracking-widest">{lightbox.caption}</div>
                {lightbox.sub && <div className="text-[10px] text-black/45 mt-0.5">{lightbox.sub}</div>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
