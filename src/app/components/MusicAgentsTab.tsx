// 音乐 tab —— frost-agent 架构控制台：展示 v2.0 各 agent（curator / harness / pipeline）
// 内容静态提炼自 frost-agent/ARCHITECTURE.md 与各 contract.md
import { useState, useEffect } from 'react';
import MusicCuratorPage from './MusicCuratorPage';
import PodcastCuratorPage from './PodcastCuratorPage';
import MoviesCuratorPage from './MoviesCuratorPage';
import BooksCuratorPage from './BooksCuratorPage';
import PhotosCuratorRunPage from './PhotosCuratorRunPage';
import TravelRunPage from './TravelRunPage';
import PlanetBuilderRunPage from './PlanetBuilderRunPage';
import CouncilPage from './CouncilPage';
import MoodRunPage from './MoodRunPage';
import PublicPlazaPage from './PublicPlazaPage';
import SkillForgePage from './SkillForgePage';
import { getLearnedSkills, subscribeSkills, type LearnedSkill } from '../../../frost-agent/harness/skillForge';

interface AgentItem {
  name: string;
  role: string;
  status: string;
}

const GROUPS: { title: string; sub: string; items: AgentItem[] }[] = [
  {
    title: 'CURATORS',
    sub: '子 agent',
    items: [
      { name: 'music-curator', role: '把音乐钉到歌手出身地 / 歌曲城市', status: '契约就位' },
      { name: 'books-curator', role: '把书钉到故事地 / 作者地 + 读完日期', status: '契约就位' },
      { name: 'movies-curator', role: '把电影钉到取景地 / 故事地', status: '契约就位' },
      { name: 'photos-curator', role: '端侧整理相册，高价值照片钉地球', status: '契约就位' },
      { name: 'travel-curator', role: '按喜好端侧规划行程，完成即钉星球', status: '契约就位' },
    ],
  },
  {
    title: 'CUSTOM',
    sub: '自定义 agent · 造星球 / 记心情',
    items: [
      { name: 'planet-builder', role: '说一个主题，抓 Unsplash 照片造一颗主题星球', status: '可运行' },
      { name: 'mood-curator', role: '记录全球赛博漫游的心情，钉到地图', status: '可运行' },
    ],
  },
  {
    title: 'COUNCIL',
    sub: '多 agent 同台 · 你来组局',
    items: [
      { name: 'council-room', role: '圆桌 / 辩论 / 法庭：多个 agent 讨论、出谋划策', status: '可运行' },
    ],
  },
  {
    title: 'RADIO',
    sub: '电台 · 城市播客',
    items: [
      { name: 'podcast-curator', role: '城市播客：每座城一段深度文化叙事', status: '可运行' },
    ],
  },
  {
    title: 'PLAZA',
    sub: 'agent 代理社交 · 前瞻',
    items: [
      { name: 'public-plaza', role: '委派你的 agent 去公共广场，带画像遇见相似的人，夜里回来报告', status: '可运行' },
    ],
  },
  {
    title: 'FORGE',
    sub: '教 frost 学新技能 · 安全闸',
    items: [
      { name: 'skill-forge', role: '一句话描述 → 云脑拟稿 → 安全审查 → 装成快捷技能', status: '可运行' },
    ],
  },
];


type Running = 'music' | 'podcast' | 'movies' | 'books' | 'photos' | 'travel' | 'planet' | 'council' | 'mood' | 'plaza' | 'forge' | null;
const RUN_BY_NAME: Record<string, Running> = {
  'music-curator': 'music', 'podcast-curator': 'podcast', 'movies-curator': 'movies',
  'books-curator': 'books', 'photos-curator': 'photos', 'travel-curator': 'travel',
  'planet-builder': 'planet', 'council-room': 'council', 'mood-curator': 'mood',
  'public-plaza': 'plaza', 'skill-forge': 'forge',
};

export default function MusicAgentsTab() {
  const [running, setRunning] = useState<Running>(null);
  // P2-I：已学技能（点击=路由到其目标 agent）
  const [learned, setLearned] = useState<LearnedSkill[]>(getLearnedSkills());
  useEffect(() => subscribeSkills(() => setLearned([...getLearnedSkills()])), []);
  const runSkill = (target: string) => { const t = RUN_BY_NAME[target]; if (t) setRunning(t); };

  if (running === 'music') return <MusicCuratorPage onBack={() => setRunning(null)} />;
  if (running === 'podcast') return <PodcastCuratorPage onBack={() => setRunning(null)} />;
  if (running === 'movies') return <MoviesCuratorPage onBack={() => setRunning(null)} />;
  if (running === 'books') return <BooksCuratorPage onBack={() => setRunning(null)} />;
  if (running === 'photos') return <PhotosCuratorRunPage onBack={() => setRunning(null)} />;
  if (running === 'travel') return <TravelRunPage onBack={() => setRunning(null)} />;
  if (running === 'planet') return <PlanetBuilderRunPage onBack={() => setRunning(null)} />;
  if (running === 'council') return <CouncilPage onBack={() => setRunning(null)} />;
  if (running === 'mood') return <MoodRunPage onBack={() => setRunning(null)} />;
  if (running === 'plaza') return <PublicPlazaPage onBack={() => setRunning(null)} />;
  if (running === 'forge') return <SkillForgePage onBack={() => setRunning(null)} onRun={runSkill} />;

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans">
      {/* 顶栏状态 */}
      <div className="flex justify-center items-center h-[30px] px-4 border-b-2 border-black bg-[#EAEAEA] shrink-0">
        <div className="font-pixel text-[10.4px] uppercase tracking-widest leading-none">POCKET EARTH</div>
      </div>

      {/* 标题 */}
      <div className="px-4 py-4 border-b-2 border-black bg-white shrink-0">
        <h1 className="font-pixel text-xl uppercase tracking-wider mb-2">FROST-AGENT</h1>
        <p className="text-xs text-black/70 tracking-wide font-medium">
          把地球作为方法的 agent 框架
        </p>
      </div>

      {/* 状态条 */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black text-[#00ff88] shrink-0">
        <div className="font-pixel text-[9px] flex justify-center items-center tracking-widest">
          <span>AGENTS: {Object.keys(RUN_BY_NAME).length}</span>
        </div>
      </div>

      {/* agent 分组列表（可滚动） */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-pixel text-[11px] tracking-widest">{g.title}</h2>
              <span className="text-[9px] text-black/45">{g.sub}</span>
            </div>
            <div className="space-y-2">
              {g.items.map((a) => {
                const target = RUN_BY_NAME[a.name];
                const runnable = !!target;
                const plaza = a.name === 'public-plaza';   // 代理社交：克制的区分色（石板蓝灰）
                const dot = plaza ? '#6b7a8f' : '#00ff88';
                const isMusic = a.name === 'music-curator';  // 音乐：用淡灰底色，和别的 agent 区分（低调、不刺眼）
                return (
                  <button
                    key={a.name}
                    onClick={runnable ? () => setRunning(target) : undefined}
                    style={isMusic ? { background: '#d9d9d9' } : undefined}
                    className={`w-full text-left flex items-center gap-3 bg-white border-2 border-black p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)] transition-colors ${
                      runnable ? (isMusic ? 'active:translate-y-px' : plaza ? 'hover:bg-[#6b7a8f]/10 active:translate-y-px' : 'hover:bg-[#00ff88]/10 active:translate-y-px') : 'cursor-default'
                    }`}
                  >
                    {/* 方块（呼应地图标记）；代理社交用区分色 */}
                    <div className="w-3 h-3 shrink-0 bg-black flex items-center justify-center border border-black" style={{ boxShadow: `1px 1px 0px ${dot}` }}>
                      <div className="w-1.5 h-1.5" style={{ background: dot }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-pixel text-[9px] tracking-wide truncate">{a.name}</div>
                      <div className="text-[11px] text-black/60 leading-tight mt-0.5">{a.role}</div>
                    </div>
                    <span className={`shrink-0 font-pixel text-[6px] uppercase tracking-wider border border-black px-1.5 py-1 ${
                      runnable ? 'bg-black text-[#7CFF6B]' : 'bg-[#00ff88] text-black'
                    }`}>
                      {runnable ? '▶ RUN' : a.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* P2-I · frost 学到的快捷技能（点击=路由到目标 agent） */}
        {learned.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-pixel text-[11px] tracking-widest">LEARNED</h2>
              <span className="text-[9px] text-black/45">frost 学到的快捷技能</span>
            </div>
            <div className="space-y-2">
              {learned.map((s) => (
                <button key={s.id} onClick={() => runSkill(s.target)}
                  className="w-full text-left flex items-center gap-3 bg-white border-2 border-black p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)] transition-colors hover:bg-[#7c8cff]/10 active:translate-y-px">
                  <div className="w-3 h-3 shrink-0 bg-black flex items-center justify-center border border-black" style={{ boxShadow: '1px 1px 0px #7c8cff' }}>
                    <div className="w-1.5 h-1.5" style={{ background: '#7c8cff' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-pixel text-[9px] tracking-wide truncate">{s.name}</div>
                    <div className="text-[11px] text-black/60 leading-tight mt-0.5 truncate">{s.desc || s.target}</div>
                  </div>
                  <span className="shrink-0 font-pixel text-[6px] uppercase tracking-wider border border-black px-1.5 py-1 bg-black text-[#7CFF6B]">▶ RUN</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-center text-[8px] font-pixel text-black/30 py-2 tracking-widest">
          端侧管「挑和找」· 云管「写」
        </div>
      </div>
    </div>
  );
}
