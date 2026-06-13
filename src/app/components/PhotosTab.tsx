import { useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import img2 from '../../imports/image-2.png';
import img3 from '../../imports/image-3.png';
import img4 from '../../imports/image-4.png';
import img5 from '../../imports/image-5.png';

// 照片 tab —— 按日历整理照片（界面取自「黑客松项目」相册日历视图，改写为本项目像素风）
// 数据：2025.06，6/1 为周日，1-30 直接铺 7 列；有照片的日期用本地图当缩略图
const PHOTOS_BY_DAY: Record<number, { img: string; count: number }> = {
  5: { img: img2, count: 3 },
  6: { img: img3, count: 8 },
  7: { img: img4, count: 2 },
  15: { img: img5, count: 12 },
  22: { img: img2, count: 5 },
  28: { img: img3, count: 1 },
};
const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const SEGMENTS = ['时间', '日历', '杂志'] as const;
type Segment = (typeof SEGMENTS)[number];

export default function PhotosTab() {
  const [segment, setSegment] = useState<Segment>('日历');
  const [lightbox, setLightbox] = useState<{ day: number; img: string } | null>(null);

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
          按日历整理你的照片。<br />
          <span className="opacity-60 text-[9px] font-pixel block mt-1">Your moments, pinned by day.</span>
        </p>
      </div>

      {/* 分段切换（时间 / 日历 / 杂志） */}
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
        {segment === '日历' ? (
          <div className="px-4 pt-4 pb-6">
            {/* 月份标题 + 导航 */}
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

            {/* 星期头 */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEK.map((d) => (
                <div key={d} className="text-center font-pixel text-[7px] text-black/45">{d}</div>
              ))}
            </div>

            {/* 日期网格 */}
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day) => {
                const p = PHOTOS_BY_DAY[day];
                if (p) {
                  return (
                    <button
                      key={day}
                      onClick={() => setLightbox({ day, img: p.img })}
                      className="aspect-square relative overflow-hidden border-2 border-black shadow-[1px_1px_0_#000] active:translate-y-px"
                    >
                      <img src={p.img} alt={`June ${day}`} className="w-full h-full object-cover grayscale contrast-125" />
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

            {/* 统计脚注 */}
            <div className="mt-4 text-center font-pixel text-[8px] text-black/30 tracking-widest">
              6 DAYS LIT · 31 PHOTOS
            </div>
          </div>
        ) : (
          // 时间 / 杂志：占位
          <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-3 py-16">
            <div className="font-pixel text-[10px] text-black/40 tracking-widest uppercase">内容待接入</div>
            <div className="text-[11px] text-black/40 leading-relaxed">
              「{segment}」视图待接入；当前请看「日历」。
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
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
              <img src={lightbox.img} alt={`June ${lightbox.day}`} className="w-full aspect-square object-cover grayscale contrast-125 border border-black" />
              <div className="py-2 text-center">
                <div className="font-pixel text-[9px] tracking-widest">JUNE {lightbox.day}, 2025</div>
                <div className="text-[10px] text-black/45 mt-0.5">{PHOTOS_BY_DAY[lightbox.day]?.count} 张照片 · LOC_SYNC</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
