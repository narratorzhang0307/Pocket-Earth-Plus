import { Image } from 'lucide-react';

// 照片 tab —— 占位界面，内容待接入（对应 photos-curator：端侧整理相册、高价值照片钉到地球）
export default function PhotosTab() {
  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans">
      {/* 顶栏状态 */}
      <div className="flex justify-between items-center px-4 py-2 border-b-2 border-black bg-[#EAEAEA] shrink-0">
        <div className="font-pixel text-[8px] uppercase">Connection: Secure</div>
        <div className="font-pixel text-[8px] text-[#00aa55]">SYS.ONLINE</div>
      </div>

      {/* 标题 */}
      <div className="px-4 py-4 border-b-2 border-black bg-white shrink-0">
        <h1 className="font-pixel text-xl uppercase tracking-wider mb-2">PHOTOS</h1>
        <p className="text-xs text-black/70 tracking-wide font-medium">
          照片<br />
          <span className="opacity-60 text-[9px] font-pixel block mt-1">Your moments, pinned to earth.</span>
        </p>
      </div>

      {/* 空占位 */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4">
        <div className="w-16 h-16 border-2 border-black bg-white flex items-center justify-center shadow-[3px_3px_0_#000]">
          <Image className="w-7 h-7 text-black/70" strokeWidth={2} />
        </div>
        <div className="font-pixel text-[10px] text-black/50 tracking-widest uppercase">内容待接入</div>
        <div className="text-[11px] text-black/40 leading-relaxed max-w-[240px]">
          端侧整理相册，给照片打标签、按价值打分，<br />只把高价值照片钉到地球上。
          <span className="block mt-1 font-pixel text-[8px] text-black/30">photos-curator · 全端侧 · 原图不出端</span>
        </div>
      </div>
    </div>
  );
}
