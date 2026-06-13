// 音乐 tab —— frost-agent 架构控制台：展示 v2.0 各 agent（curator / harness / pipeline）
// 内容静态提炼自 frost-agent/ARCHITECTURE.md 与各 contract.md

interface AgentItem {
  name: string;
  role: string;
  status: string;
}

const GROUPS: { title: string; sub: string; items: AgentItem[] }[] = [
  {
    title: 'CURATORS',
    sub: '落点子 agent · 把对象钉到地球',
    items: [
      { name: 'music-curator', role: '把音乐钉到歌手出身地 / 歌曲城市', status: '契约就位' },
      { name: 'books-curator', role: '把书钉到故事地 / 作者地 + 读完日期', status: '契约就位' },
      { name: 'movies-curator', role: '把电影钉到取景地 / 故事地', status: '契约就位' },
      { name: 'photos-curator', role: '端侧整理相册，高价值照片钉地球', status: '契约就位' },
    ],
  },
  {
    title: 'HARNESS',
    sub: '内核 · 路由 / 大脑 / 边界',
    items: [
      { name: 'router', role: '混合路由：规则秒回 → 大脑 → 兜底', status: '已落地' },
      { name: 'brain', role: '可插拔云 LLM，无 key 自动降级', status: '已落地' },
      { name: 'selector', role: '端侧选择 / 排序 / 嵌入（选歌选图）', status: '设计中' },
      { name: 'validator', role: '动作建议过校验才落地（Boundary）', status: '已落地' },
      { name: 'memory', role: '会话 + 长期画像', status: '会话级已落地' },
    ],
  },
  {
    title: 'PIPELINES',
    sub: '离线流水线 · 后端资产',
    items: [
      { name: 'music-pipeline', role: '音频解析 → 入库 audio.db', status: '写库已落地' },
      { name: 'script-tts-pipeline', role: 'DJ 文稿口语化 → TTS → 写库', status: '部分落地' },
      { name: 'writer-book', role: '文本抽取分块 → RAG 语料', status: '分块落地' },
    ],
  },
];

const totalAgents = GROUPS.reduce((n, g) => n + g.items.length, 0);

export default function MusicAgentsTab() {
  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans">
      {/* 顶栏状态 */}
      <div className="flex justify-between items-center px-4 py-2 border-b-2 border-black bg-[#EAEAEA] shrink-0">
        <div className="font-pixel text-[8px] uppercase">Connection: Secure</div>
        <div className="font-pixel text-[8px] text-[#00aa55]">SYS.ONLINE</div>
      </div>

      {/* 标题 */}
      <div className="px-4 py-4 border-b-2 border-black bg-white shrink-0">
        <h1 className="font-pixel text-xl uppercase tracking-wider mb-2">FROST-AGENT</h1>
        <p className="text-xs text-black/70 tracking-wide font-medium">
          把世界钉到地球上的 agent 框架。<br />
          <span className="opacity-60 text-[9px] font-pixel block mt-1">Router · Skill · Sub-agent · Tool</span>
        </p>
      </div>

      {/* 状态条 */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black text-[#00ff88] shrink-0">
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>AGENTS: {totalAgents}</span>
          <span className="opacity-50">|</span>
          <span>CURATORS: 4</span>
          <span className="opacity-50">|</span>
          <span>EDGE+CLOUD</span>
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
              {g.items.map((a) => (
                <div
                  key={a.name}
                  className="flex items-center gap-3 bg-white border-2 border-black p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)]"
                >
                  {/* 绿色方块（呼应地图标记） */}
                  <div className="w-3 h-3 shrink-0 bg-black flex items-center justify-center border border-black shadow-[1px_1px_0px_#00ff88]">
                    <div className="w-1.5 h-1.5 bg-[#00ff88]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-pixel text-[9px] tracking-wide truncate">{a.name}</div>
                    <div className="text-[11px] text-black/60 leading-tight mt-0.5">{a.role}</div>
                  </div>
                  <span className="shrink-0 font-pixel text-[6px] uppercase tracking-wider bg-[#00ff88] text-black border border-black px-1.5 py-1">
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="text-center text-[8px] font-pixel text-black/30 py-2 tracking-widest">
          端侧管「挑和找」· 云管「写」
        </div>
      </div>
    </div>
  );
}
