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
import FrostBuddyPage from './FrostBuddyPage';
import FrostBuddy from './FrostBuddy';
import OnDeviceBrainPanel from './OnDeviceBrainPanel';
import AgentForgePage from './AgentForgePage';
import { getCustomAgents, subscribeCustomAgents, type AgentManifest } from '../lib/agent';
import { getLearnedSkills, subscribeSkills, type LearnedSkill } from '../../../frost-agent/harness/skillForge';
import { startHeartbeat } from '../../../frost-agent/harness/heartbeat';

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
      { name: 'planet-builder', role: '说一个主题，抓 Unsplash 照片造一颗主题星球', status: '可运行' },
      { name: 'mood-curator', role: '记录全球赛博漫游的心情，钉到地图', status: '可运行' },
      { name: 'podcast-curator', role: '城市播客：每座城一段深度文化叙事', status: '可运行' },
      { name: 'skill-forge', role: '一句话描述 → 云脑拟稿 → 安全审查 → 装成快捷技能', status: '可运行' },
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
    title: 'PLAZA',
    sub: 'agent 代理社交 · 前瞻',
    items: [
      { name: 'public-plaza', role: '委派你的 agent 去公共广场，带画像遇见相似的人，夜里回来报告', status: '可运行' },
    ],
  },
];


type Running = 'frost' | 'music' | 'podcast' | 'movies' | 'books' | 'photos' | 'travel' | 'planet' | 'council' | 'mood' | 'plaza' | 'forge' | 'agentforge' | null;
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
  // 造物主造出的自建 agent（展示在控制台、可直接运行）
  const [customAgents, setCustomAgents] = useState<AgentManifest[]>(getCustomAgents());
  useEffect(() => subscribeCustomAgents(() => setCustomAgents([...getCustomAgents()])), []);
  // 启动 FROST heartbeat：进入控制台即定期产「主动建议」（此前 startHeartbeat 全仓零调用，建议链路静默常关）。
  // 幂等（只起一个定时器），卸载时清理。
  useEffect(() => startHeartbeat(), []);
  const runSkill = (target: string) => { const t = RUN_BY_NAME[target]; if (t) setRunning(t); };

  if (running === 'frost') return <FrostBuddyPage onBack={() => setRunning(null)} onRun={runSkill} />;
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
  if (running === 'agentforge') return <AgentForgePage onBack={() => setRunning(null)} />;

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
        {/* 置顶：总 agent FROST —— 统领所有子 agent 的宠物入口（点进去跟它对话）*/}
        <button
          onClick={() => setRunning('frost')}
          className="w-full text-left flex items-center gap-3 border-2 border-black p-2.5 shadow-[3px_3px_0_rgba(0,0,0,0.85)] active:translate-y-px"
          style={{ background: '#d9d9d9' }}
        >
          <div className="shrink-0 flex items-center justify-center" style={{ width: 100, height: 76 }}><FrostBuddy state="idle" cycle color="#1d3e57" glow={false} size={11} /></div>
          <div className="min-w-0 flex-1">
            <div className="font-pixel text-[11px] tracking-wider text-black">FROST</div>
            <div className="text-[10.5px] text-black/60 leading-snug mt-0.5">我是弗洛斯特。在上界司命所创造的一切事物中，弗洛斯特是最完美的，最有威力的，也是最难以理解的。</div>
          </div>
          <span className="shrink-0 font-pixel text-[6px] uppercase tracking-wider border border-black bg-black text-[#7CFF6B] px-1.5 py-1">▶ RUN</span>
        </button>

        {/* 端侧大脑：一键把 Qwen3 加载进浏览器（WebGPU），意图/选择本地跑、不出端 */}
        <OnDeviceBrainPanel />

        {/* 造物主：一个能造 agent 的 agent —— 说一句话长出新的 curator */}
        <button
          onClick={() => setRunning('agentforge')}
          className="w-full text-left flex items-center gap-2.5 border-2 border-black p-2.5 shadow-[3px_3px_0_rgba(0,0,0,0.85)] active:translate-y-px"
          style={{ background: '#fff1e6' }}
        >
          <div className="shrink-0 w-10 h-10 border-2 border-black flex items-center justify-center text-[20px]" style={{ background: '#ff8a3d' }}>🛠</div>
          <div className="min-w-0 flex-1">
            <div className="font-pixel text-[11px] tracking-wider text-black">AGENT-FORGE · 造物主</div>
            <div className="text-[10px] text-black/60 leading-snug mt-0.5">说一句话，让 frost 造一个新 agent（端侧/云 Qwen 拟稿 → 安全闸 → 钉地球）</div>
          </div>
          <span className="shrink-0 font-pixel text-[6px] uppercase tracking-wider border border-black bg-black text-[#ff8a3d] px-1.5 py-1">▶ RUN</span>
        </button>

        {/* 已造的自建 agent（造物主产出，直接可跑） */}
        {customAgents.length > 0 && (
          <div className="space-y-2">
            <div className="font-pixel text-[8px] tracking-widest text-black/55 px-0.5">我的自建 AGENT</div>
            {customAgents.map((a) => (
              <button key={a.id} onClick={() => setRunning('agentforge')}
                className="w-full text-left flex items-center gap-2.5 border-2 border-black p-2 bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)] active:translate-y-px">
                <div className="shrink-0 w-8 h-8 border-2 border-black flex items-center justify-center text-[16px]" style={{ background: a.color }}>{a.emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold truncate">{a.name}</div>
                  <div className="text-[10px] text-black/55 leading-tight truncate">{a.desc || a.domain}</div>
                </div>
                <span className="shrink-0 font-pixel text-[6px] uppercase tracking-wider border border-black px-1.5 py-1" style={{ background: a.color }}>▶ RUN</span>
              </button>
            ))}
          </div>
        )}

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
                return (
                  <button
                    key={a.name}
                    onClick={runnable ? () => setRunning(target) : undefined}
                    className={`w-full text-left flex items-center gap-3 bg-white border-2 border-black p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)] transition-colors ${
                      runnable ? (plaza ? 'hover:bg-[#6b7a8f]/10 active:translate-y-px' : 'hover:bg-[#00ff88]/10 active:translate-y-px') : 'cursor-default'
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
