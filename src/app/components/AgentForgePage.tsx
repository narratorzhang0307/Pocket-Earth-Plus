// 造物主 · meta-agent 运行页：一个能「造 agent」的 agent。
// 一句话描述 → Qwen（云/端侧）拟一份【声明式 manifest】→ 安全审查闸 → 安装 →
// 自建 agent 出现在下方、可运行 → 跑一条输入 → 出草稿 → 钉到地球（kind:'custom'）。
// 全程不生成/执行代码、不碰内核。详见 src/app/lib/agent/。
import { useState, useEffect } from 'react';
import { ChevronLeft, Hammer, Check, X, Trash2, Play, Cpu, Cloud, MapPin, Archive, Map, Loader2, Camera } from 'lucide-react';
import {
  proposeManifest, reviewManifest, installAgent, getCustomAgents, subscribeCustomAgents, removeCustomAgent,
  runCustomAgent, runCustomAgentFromImage, confirmPin, GEO_LABEL,
  populateMap, confirmMapRecords,
  type AgentManifest, type ManifestReview, type CustomDraft, type MapDraft, type MapRecord,
} from '../lib/agent';
import RunTrace from './RunTrace';
import { startAgentRun } from '../lib/observe/bus';

const ACCENT = '#ff8a3d';

export default function AgentForgePage({ onBack }: { onBack: () => void }) {
  const [agents, setAgents] = useState<AgentManifest[]>(getCustomAgents());
  useEffect(() => subscribeCustomAgents(() => setAgents([...getCustomAgents()])), []);

  // 造：描述 → manifest 草案
  const [desc, setDesc] = useState('');
  const [onEdge, setOnEdge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<AgentManifest> | null>(null);
  const [review, setReview] = useState<ManifestReview | null>(null);
  const [via, setVia] = useState<'edge' | 'cloud' | 'none'>('none');
  const [err, setErr] = useState('');

  // 跑：选中一个自建 agent
  const [run, setRun] = useState<AgentManifest | null>(null);

  const generate = async () => {
    const d = desc.trim();
    if (!d || busy) return;
    setBusy(true); setDraft(null); setReview(null); setErr('');
    const { draft: m, via: v } = await proposeManifest(d, { onEdge });
    setBusy(false); setVia(v);
    if (!m) { setErr('拟稿失败（云脑/端侧未就绪或没吐出合法 JSON）。'); return; }
    setDraft(m); setReview(reviewManifest({ ...m, id: 'x', createdAt: '2026-01-01' }));
  };

  const install = () => {
    if (!draft) return;
    const { review: r } = installAgent(draft);
    setReview(r);
    if (r.ok) { setDraft(null); setDesc(''); }
  };

  if (run) return <RunView manifest={run} onBack={() => setRun(null)} onEdge={onEdge} />;

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">AGENT-FORGE</div>
          <div className="text-[9px] text-black/45 leading-tight mt-0.5">说一句话，让 frost 造一个新 agent</div>
        </div>
        <Hammer className="w-4 h-4" strokeWidth={2.5} style={{ color: ACCENT }} />
      </div>

      {/* Stat strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black shrink-0" style={{ color: ACCENT }}>
        <div className="font-pixel text-[8px] flex justify-center items-center gap-3 tracking-widest">
          <span>已造 {agents.length}</span><span className="opacity-40">·</span><span>声明式 · 安全闸 · 不写代码</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* 描述 → 生成 */}
        <div className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
            placeholder="想造个什么 agent？例：帮我整理喝过的咖啡馆，钉到店所在城市"
            className="w-full border-2 border-black px-2.5 py-2 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white resize-none" />
          <div className="flex items-center gap-2 mt-2">
            {/* 云/端侧拟稿切换 */}
            <button onClick={() => setOnEdge((v) => !v)}
              className="flex items-center gap-1 border-2 border-black px-2 py-1.5 text-[9px] font-bold bg-white shadow-[1px_1px_0_#000] active:translate-y-px">
              {onEdge ? <><Cpu className="w-3 h-3" strokeWidth={2.5} style={{ color: '#00aa55' }} />端侧拟稿</> : <><Cloud className="w-3 h-3" strokeWidth={2.5} />云脑拟稿</>}
            </button>
            <span className="text-[8.5px] text-black/45 leading-snug flex-1">拟稿 → 安全审查 → 你确认才安装；只产声明式 manifest，不执行任何代码。</span>
            <button onClick={generate} disabled={busy || !desc.trim()}
              className="flex items-center gap-1 border-2 border-black px-3 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-white disabled:opacity-40" style={{ background: ACCENT }}>
              {busy ? '拟稿中…' : '造 ✦'}
            </button>
          </div>
        </div>

        {err && <div className="border-2 border-black bg-[#ffecec] text-[#b00] text-[11px] p-2.5">{err}</div>}

        {/* 草案 + 安全审查 */}
        {draft && review && (
          <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between mb-1.5">
              <div className="font-pixel text-[8px] tracking-widest" style={{ color: ACCENT }}>◍ 草案 · 待安全审查</div>
              <span className="font-pixel text-[7px] tracking-wider border border-black px-1.5 py-0.5" style={{ background: via === 'edge' ? '#e7fff1' : '#eef3ff' }}>
                {via === 'edge' ? '端侧 Qwen 拟稿' : '云 Qwen 拟稿'}
              </span>
            </div>
            <div className="text-[14px] font-bold">{String(draft.emoji || '📦')} {String(draft.name || '(无名)')}</div>
            <div className="text-[11px] text-black/60 leading-snug mt-0.5">{String(draft.desc || '')}</div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(draft.tagFields || []).map((k, i) => <span key={i} className="text-[9px] border border-black px-1.5 py-0.5 bg-[#EAEAEA]">{String(k)}</span>)}
            </div>
            <div className="text-[10px] text-black/55 mt-2 space-y-0.5">
              <div>对象：<b>{String(draft.domain || '?')}</b> · 落点：{(draft.geoStrategy || []).map((g) => GEO_LABEL[g] || g).join(' > ') || '?'}</div>
              <div>触发词：{(draft.keywords || []).join('、')}</div>
            </div>
            {/* 安全审查结论 */}
            <div className="mt-2.5 border-t-2 border-dashed border-black/20 pt-2">
              {review.ok ? (
                <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: '#0a8' }}><Check className="w-4 h-4" strokeWidth={3} />安全审查通过</div>
              ) : (
                <div className="text-[11px] text-[#b00]">
                  <div className="flex items-center gap-1.5 font-bold mb-1"><X className="w-4 h-4" strokeWidth={3} />未通过安全审查</div>
                  <ul className="list-disc pl-5 space-y-0.5">{review.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
            </div>
            <button onClick={install} disabled={!review.ok}
              className="w-full mt-2.5 border-2 border-black py-1.5 font-pixel text-[9px] uppercase tracking-wider text-white shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-30" style={{ background: ACCENT }}>
              安装这个 agent
            </button>
          </div>
        )}

        {/* 已造 agent */}
        <div className="flex items-center gap-1.5 px-0.5 pt-1">
          <span className="font-pixel text-[8px] tracking-widest text-black/55">已造 agent · MY AGENTS</span>
        </div>
        {agents.length === 0 && <div className="text-[11px] text-black/40 px-0.5">还没有自建 agent。上面描述一句，造你的第一个。</div>}
        {agents.map((a) => (
          <div key={a.id} className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="flex items-center gap-2">
              <div className="shrink-0 w-9 h-9 border-2 border-black flex items-center justify-center text-[18px]" style={{ background: a.color }}>{a.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold truncate">{a.name}</div>
                <div className="text-[10px] text-black/55 leading-tight truncate">{a.desc || a.domain}</div>
              </div>
              <button onClick={() => setRun(a)} className="shrink-0 flex items-center gap-1 border-2 border-black px-2 py-1 font-pixel text-[8px] text-white active:translate-y-px" style={{ background: ACCENT }}>
                <Play className="w-3 h-3" strokeWidth={3} />运行
              </button>
              <button onClick={() => removeCustomAgent(a.id)} className="shrink-0 w-7 h-7 border-2 border-black bg-white flex items-center justify-center active:translate-y-px">
                <Trash2 className="w-3.5 h-3.5 text-black/55" strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {a.tagFields.slice(0, 6).map((k, i) => <span key={i} className="text-[9px] border border-black px-1.5 py-0.5 bg-[#EAEAEA]">{k}</span>)}
            </div>
          </div>
        ))}

        <div className="text-center text-[8px] font-pixel text-black/30 py-1.5 tracking-widest leading-relaxed">
          自建 agent = 声明式 manifest · 安全闸禁任意代码<br />落点统一钉到地球「自建」层
        </div>
      </div>
    </div>
  );
}

// —— 运行子视图：跑一个自建 agent，出草稿，钉地球 ——
function RunView({ manifest, onBack, onEdge }: { manifest: AgentManifest; onBack: () => void; onEdge: boolean }) {
  const [mode, setMode] = useState<'one' | 'map'>('one');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<CustomDraft | null>(null);
  const [pinMsg, setPinMsg] = useState('');

  // 建图挡：一句主题 → 多步自主流水线 → 草稿批 → 勾选钉地球
  const [goal, setGoal] = useState('');
  const [mapBusy, setMapBusy] = useState(false);
  const [mapRunId, setMapRunId] = useState<string | null>(null);   // FrostBus 运行 id → RunTrace 编排树
  const [mapDraft, setMapDraft] = useState<MapDraft | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [mapMsg, setMapMsg] = useState('');

  const go = async () => {
    const t = input.trim();
    if (!t || busy) return;
    setBusy(true); setDraft(null); setPinMsg('');
    const d = await runCustomAgent(manifest, t, { onEdge });
    setBusy(false);
    if (!d) { setPinMsg('没认出来，换一句试试'); return; }
    setDraft(d);
  };

  // 截图/拍照入库：原图只进端侧 VL（不出端），经 visionExtract skill 读成结构化草稿。
  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || busy) return;
    setBusy(true); setDraft(null); setPinMsg('');
    const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => res(''); r.readAsDataURL(f); });
    const d = url ? await runCustomAgentFromImage(manifest, url) : null;
    setBusy(false);
    if (!d) { setPinMsg('端侧识图未就绪或没读出（原图不会上云）。可改用文字，或先在控制台启用端侧大脑。'); return; }
    setDraft(d);
  };

  const pin = () => {
    if (!draft) return;
    const r = confirmPin(manifest, draft);
    setPinMsg(r.pinned ? (r.reason === 'exists' ? '已经钉过了' : '已钉到地球「自建」层 ✓') : '还没定位到地点，无法钉');
  };

  const buildMap = async () => {
    const g = goal.trim();
    if (!g || mapBusy) return;
    setMapBusy(true); setMapDraft(null); setMapMsg('');
    // 一次 FrostBus 运行 → RunTrace 把 规划→搜索→反思→地理编码 渲成实时编排树（与各 agent 同款可观测）
    const run = startAgentRun(`建图 · ${manifest.domain} · ${g.slice(0, 16)}`); setMapRunId(run.runId);
    const d = await populateMap(manifest, g, (p, note) => run.phase(p, note));
    run.end(d.records.length > 0);
    setMapBusy(false); setMapDraft(d);
    // 默认勾选所有「能落点」的
    setPicked(new Set(d.records.map((r, i) => (r.geo ? i : -1)).filter((i) => i >= 0)));
  };
  const togglePick = (i: number) => setPicked((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const pinPicked = () => {
    if (!mapDraft) return;
    const recs = mapDraft.records.filter((_, i) => picked.has(i));
    const n = confirmMapRecords(manifest, recs);
    setMapMsg(`已钉 ${n} 个到地球「自建」层 ✓`);
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="shrink-0 w-8 h-8 border-2 border-black flex items-center justify-center text-[16px]" style={{ background: manifest.color }}>{manifest.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">{manifest.name}</div>
          <div className="text-[9px] text-black/45 leading-tight mt-0.5 truncate">{manifest.desc || manifest.domain}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* 模式切换：逐条整理 / 建图（多步自主流水线） */}
        <div className="flex gap-1.5">
          {([['one', '逐条整理'], ['map', '🗺 建图']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 border-2 border-black py-1.5 font-pixel text-[9px] tracking-wider shadow-[1px_1px_0_#000] active:translate-y-px ${mode === m ? 'text-white' : 'bg-white text-black/60'}`}
              style={mode === m ? { background: manifest.color } : undefined}>{label}</button>
          ))}
        </div>

        {mode === 'one' && (<>
        <div className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2}
            placeholder={`给「${manifest.name}」一条「${manifest.domain}」，例：蓝瓶咖啡 三里屯店`}
            className="w-full border-2 border-black px-2.5 py-2 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white resize-none" />
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[8.5px] text-black/45 flex-1">文字 或 截图/拍照（图只进端侧 VL · 不出端）→ 出草稿 → 你确认才钉</span>
            {/* 截图/拍照入库：原图只进端侧视觉模型，绝不上云 */}
            <label className={`flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[10px] font-bold bg-white shadow-[1px_1px_0_#000] active:translate-y-px cursor-pointer ${busy ? 'opacity-40 pointer-events-none' : ''}`}>
              <Camera className="w-3.5 h-3.5" strokeWidth={2.5} />图
              <input type="file" accept="image/*" className="hidden" onChange={onImage} />
            </label>
            <button onClick={go} disabled={busy || !input.trim()}
              className="border-2 border-black px-3 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-white disabled:opacity-40" style={{ background: manifest.color }}>
              {busy ? '整理中…' : '整理 ✦'}
            </button>
          </div>
        </div>

        {draft && (
          <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="font-pixel text-[8px] tracking-widest mb-1.5" style={{ color: manifest.color }}>◍ 草案 · {draft.via === 'edge' ? '端侧' : draft.via === 'cloud' ? '云脑' : '规则'}</div>
            <div className="text-[14px] font-bold">{manifest.emoji} {draft.label}</div>
            {draft.note && <div className="text-[11px] text-black/65 leading-snug mt-1">{draft.note}</div>}
            {Object.keys(draft.tags).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.entries(draft.tags).map(([k, v]) => <span key={k} className="text-[9px] border border-black px-1.5 py-0.5 bg-[#f6f6f6]">{k}：{v}</span>)}
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-black/55">
              <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} />
              {draft.geo ? <span>{draft.geo.place} · {GEO_LABEL[draft.geo.strategy as keyof typeof GEO_LABEL] || draft.geo.strategy}</span> : <span className="text-[#b06a00]">未定位到地点（试试更具体的城市/国家）</span>}
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <button onClick={pin} disabled={!draft.geo}
                className="flex items-center gap-1 border-2 border-black px-3 py-1.5 text-[11px] font-bold text-white shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-40" style={{ background: manifest.color }}>
                <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} />钉到地球
              </button>
              <button onClick={() => { setDraft(null); setInput(''); setPinMsg(''); }}
                className="flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[10px] font-bold bg-white shadow-[1px_1px_0_#000] active:translate-y-px">
                <Archive className="w-3.5 h-3.5" strokeWidth={2.5} />换一条
              </button>
            </div>
          </div>
        )}
        {pinMsg && <div className="border-2 border-black bg-[#f6fff9] text-[12px] p-2.5 font-bold" style={{ color: '#0a8' }}>{pinMsg}</div>}
        </>)}

        {mode === 'map' && (<>
        {/* 建图挡：一句主题 → 规划→联网搜索→反思 多步流水线 → 草稿批 → 勾选钉地球 */}
        <div className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2}
            placeholder={`说一个主题，自动建一张「${manifest.domain}」地图，例：杭州观鸟地图`}
            className="w-full border-2 border-black px-2.5 py-2 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white resize-none" />
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[8.5px] text-black/45 flex-1 leading-snug">云 Qwen 联网搜索：规划 → 搜真实条目 → 反思补全 → 摊草稿批，你勾选才钉（几十秒）</span>
            <button onClick={buildMap} disabled={mapBusy || !goal.trim()}
              className="flex items-center gap-1 border-2 border-black px-3 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-white disabled:opacity-40" style={{ background: manifest.color }}>
              {mapBusy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={3} />建图中…</> : <><Map className="w-3.5 h-3.5" strokeWidth={2.5} />开始建图</>}
            </button>
          </div>
          {mapRunId && <div className="mt-2"><RunTrace runId={mapRunId} /></div>}
        </div>

        {mapDraft && (
          <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between mb-1">
              <div className="font-pixel text-[8px] tracking-widest" style={{ color: manifest.color }}>◍ 草案批 · {mapDraft.records.length} 个</div>
              <span className="text-[8.5px] text-black/45">{mapDraft.rounds} 轮 · {mapDraft.queriesRun.length} 次搜索 · 已选 {picked.size}</span>
            </div>
            <div className="text-[11px] text-black/60 mb-2">「{mapDraft.goal}」· 勾选要钉的（默认全选可落点项）</div>
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {mapDraft.records.map((r: MapRecord, i: number) => (
                <button key={i} onClick={() => r.geo && togglePick(i)} disabled={!r.geo}
                  className={`w-full text-left flex items-start gap-2 border-2 border-black p-1.5 ${picked.has(i) ? 'bg-[#f6fff9]' : 'bg-white'} ${!r.geo ? 'opacity-45' : 'active:translate-y-px'}`}>
                  <span className="shrink-0 w-4 h-4 border-2 border-black flex items-center justify-center mt-0.5" style={{ background: picked.has(i) ? manifest.color : '#fff' }}>
                    {picked.has(i) && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-[12px] font-bold">{r.label}</span>
                    {r.note && <span className="block text-[10px] text-black/55 leading-tight">{r.note}</span>}
                    <span className="block text-[9px] text-black/45 mt-0.5">{r.geo ? `📍 ${r.geo.place}` : '⚠ 未定位'}{r.source ? ` · 源:${r.source}` : ''}</span>
                  </span>
                </button>
              ))}
            </div>
            <button onClick={pinPicked} disabled={picked.size === 0}
              className="w-full mt-2.5 flex items-center justify-center gap-1 border-2 border-black py-1.5 font-pixel text-[9px] uppercase tracking-wider text-white shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-30" style={{ background: manifest.color }}>
              <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} />钉选中的 {picked.size} 个到地球
            </button>
          </div>
        )}
        {mapMsg && <div className="border-2 border-black bg-[#f6fff9] text-[12px] p-2.5 font-bold" style={{ color: '#0a8' }}>{mapMsg}</div>}
        </>)}
      </div>
    </div>
  );
}
