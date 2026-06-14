import { useState } from 'react';
import { Image, Globe, Sparkles } from 'lucide-react';
import PhotosTab from './components/PhotosTab';
import MyMapTab from './components/MyMapTab';
import MusicAgentsTab from './components/MusicAgentsTab';

type Tab = 'photos' | 'earth' | 'agents';

// 430×932 手机框（iPhone 15 Pro Max 逻辑尺寸 · 19.5:9）+ 底部三 tab（照片 / 地球 / 智能体）
// 用 aspect-ratio + max-w-full/max-h 等比自适应：窄屏按宽收，矮屏按高收，比例恒为 430:932
export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('earth');

  return (
    <div className="min-h-screen w-full bg-[#dcdcdc] flex items-center justify-center p-4 overflow-auto">
      <div className="relative shrink-0 bg-[#EAEAEA] overflow-hidden shadow-2xl flex flex-col" style={{ width: 'min(430px, 100vw, calc(100dvh * 430 / 932))', aspectRatio: '430 / 932' }}>
        {/* 内容区（底部留给 tab bar） */}
        <div className="flex-1 overflow-hidden relative pb-[84px]">
          {activeTab === 'photos' && <PhotosTab />}
          {activeTab === 'earth' && <MyMapTab />}
          {activeTab === 'agents' && <MusicAgentsTab />}
        </div>

        {/* 底部 tab bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[88px] bg-[#EAEAEA] border-t-2 border-black z-30 pt-2 pb-5">
          <div className="flex h-full items-center justify-between px-6">
            {/* 左：照片 */}
            <button
              onClick={() => setActiveTab('photos')}
              className={`flex flex-col items-center gap-1.5 transition-all w-20 ${
                activeTab === 'photos' ? 'text-[#00aa55]' : 'text-black/40 hover:text-black'
              }`}
            >
              <Image className="w-6 h-6" strokeWidth={2.5} />
              <span className="text-[8px] font-pixel uppercase tracking-widest">Photos</span>
            </button>

            {/* 中：地球（黑底地球入口） */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => setActiveTab('earth')}
                className={`w-[60px] h-[60px] rounded-full border-[3px] border-black flex items-center justify-center transition-all bg-black ${
                  activeTab === 'earth'
                    ? 'shadow-[inset_0_0_15px_rgba(0,255,136,0.35)] translate-y-1'
                    : 'shadow-[0_4px_0_#000] hover:-translate-y-0.5 hover:shadow-[0_5px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000]'
                }`}
                title="地球"
              >
                <Globe className="w-7 h-7 text-[#00ff88]" strokeWidth={2.5} />
              </button>
            </div>

            {/* 右：智能体控制台 */}
            <button
              onClick={() => setActiveTab('agents')}
              className={`flex flex-col items-center gap-1.5 transition-all w-20 ${
                activeTab === 'agents' ? 'text-[#00aa55]' : 'text-black/40 hover:text-black'
              }`}
            >
              <Sparkles className="w-6 h-6" strokeWidth={2.5} />
              <span className="text-[8px] font-pixel uppercase tracking-widest">Agents</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
