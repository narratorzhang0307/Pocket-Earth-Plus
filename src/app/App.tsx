import { useState } from 'react';
import { Image, Globe, Radio } from 'lucide-react';
import PhotosTab from './components/PhotosTab';
import MyMapTab from './components/MyMapTab';
import MusicAgentsTab from './components/MusicAgentsTab';

type Tab = 'photos' | 'earth' | 'music';

// 仿「上街去」手机 App：393×852 手机框 + 底部三 tab（照片 / 地球 / 音乐）
export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('earth');

  return (
    <div className="min-h-screen w-full bg-[#dcdcdc] flex items-center justify-center p-4 overflow-auto">
      <div className="relative w-[393px] h-[852px] shrink-0 bg-[#EAEAEA] overflow-hidden shadow-2xl flex flex-col">
        {/* 内容区（底部留给 tab bar） */}
        <div className="flex-1 overflow-hidden relative pb-[84px]">
          {activeTab === 'photos' && <PhotosTab />}
          {activeTab === 'earth' && <MyMapTab />}
          {activeTab === 'music' && <MusicAgentsTab />}
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

            {/* 右：音乐 */}
            <button
              onClick={() => setActiveTab('music')}
              className={`flex flex-col items-center gap-1.5 transition-all w-20 ${
                activeTab === 'music' ? 'text-[#00aa55]' : 'text-black/40 hover:text-black'
              }`}
            >
              <Radio className="w-6 h-6" strokeWidth={2.5} />
              <span className="text-[8px] font-pixel uppercase tracking-widest">Music</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
