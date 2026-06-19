import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Trash2, MapPin, Upload, Sparkles } from 'lucide-react';
import { curated, dupGroups, curationStats, VERDICT_LABEL, VERDICT_COLOR, type CuratedPhoto } from '../data/photoCuration';
import { edgeSafe } from '../../../frost-agent/edge/contract';
import { downscaleForVision } from '../lib/imageDownscale';
import { runScreen, type PhotoResult, type PhotoType, type Verdict, TYPE_LABEL, addPhotoPins, toPins, learnFromOverride, recordPhotoOverride, getPrefs } from '../lib/photo';

// photos-curator 运行页 —— 真·端侧照片整理 agent。
// 「我的照片」：用户在系统选择器多选自己的真实照片 → 设年月范围 → 一键端侧筛选
//   （混合：快速逐像素分析 + 可选小视觉模型精筛）→ 真实打分/查重/判留删，全程原图不出手机。
// 「示例」：原概念报告（mock 数据），留作演示。

interface Props { onBack: () => void }
const onImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.opacity = '0'; };

// 真·结果的判定配色
const RV_LABEL: Record<Verdict, string> = { keep: '留', review: '待定', clean: '可清理' };
const RV_COLOR: Record<Verdict, string> = { keep: '#00aa55', review: '#c08a00', clean: '#d23b3b' };

const NOW_Y = new Date().getFullYear();
const YEARS = Array.from({ length: NOW_Y - 2007 }, (_, i) => NOW_Y - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// ───────────────────────── 示例（原概念报告，mock） ─────────────────────────
const CLEAN_KEY = 'pe.photoCleaned.v1';
function loadCleaned(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CLEAN_KEY) || '[]')); } catch { return new Set(); }
}
const SEGMENTS = ['整理报告', '重复清理', '高价值'] as const;
type Segment = (typeof SEGMENTS)[number];

function DemoView() {
  const [segment, setSegment] = useState<Segment>('整理报告');
  const [scanned, setScanned] = useState(0);
  const [cleaned, setCleaned] = useState<Set<string>>(loadCleaned);
  const [edgeScored, setEdgeScored] = useState<Record<string, { score?: number; reason: string; busy?: boolean }>>({});
  const [edgeRunning, setEdgeRunning] = useState(false);
  const total = curationStats.total;
  const done = scanned >= total;

  useEffect(() => {
    if (scanned >= total) return;
    const t = window.setInterval(() => setScanned((s) => Math.min(total, s + Math.max(3, Math.round(total / 40)))), 90);
    return () => window.clearInterval(t);
  }, [scanned, total]);

  const persistCleaned = (next: Set<string>) => {
    setCleaned(next);
    try { localStorage.setItem(CLEAN_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  };
  const cleanGroup = (g: typeof dupGroups[number]) => {
    const next = new Set(cleaned); g.photos.forEach((p) => { if (p.id !== g.keepId) next.add(p.id); }); persistCleaned(next);
  };
  const cleanAllDups = () => {
    const next = new Set(cleaned); dupGroups.forEach((g) => g.photos.forEach((p) => { if (p.id !== g.keepId) next.add(p.id); })); persistCleaned(next);
  };

  const report = useMemo(() => [...curated].sort((a, b) => b.score - a.score), []);
  const shown = report.slice(0, Math.max(scanned, done ? total : 0));
  const keeps = useMemo(() => curated.filter((c) => c.verdict === 'keep'), []);

  const runEdgeScore = async () => {
    if (edgeRunning) return;
    const picks = report.filter((c) => c.thumb && /^https?:/.test(c.thumb) && !edgeScored[c.id]).slice(0, 3);
    if (!picks.length) return;
    setEdgeRunning(true);
    for (const c of picks) {
      setEdgeScored((m) => ({ ...m, [c.id]: { reason: '端侧看图中…', busy: true } }));
      let score: number | undefined; let reason = '';
      try {
        const img = await downscaleForVision(c.thumb!);
        const out = await edgeSafe.vision(img, '看这张照片，判断收藏价值。只回 JSON：{"score":0到100的整数,"reason":"一句不超过18字的中文理由"}');
        const norm = (out || '').replace(/```json|```/g, '').trim().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
        const obj = norm.match(/\{[\s\S]*?\}/);
        try { const j = JSON.parse(obj ? obj[0] : norm); score = Math.round(Number(j.score)); reason = String(j.reason || '').slice(0, 24); } catch { /* */ }
        if (score === undefined || Number.isNaN(score)) { const sm = norm.match(/score["']?\s*[:：]\s*["']?(\d{1,3})/) || norm.match(/(\d{1,3})/); if (sm) score = Math.min(100, Number(sm[1])); }
        if (!reason) { const rm = norm.match(/reason["']?\s*[:：]\s*["']?([^"'}\n]+)/); reason = (rm ? rm[1] : norm.replace(/[{}"]/g, '')).trim().slice(0, 24); }
      } catch { /* */ }
      setEdgeScored((m) => ({ ...m, [c.id]: { score, reason: reason || '端侧未就绪', busy: false } }));
    }
    setEdgeRunning(false);
  };

  const Card = (c: CuratedPhoto, idx: number) => {
    const isClean = cleaned.has(c.id);
    return (
      <div key={c.id + '#' + idx} className={`flex gap-2.5 border-2 border-black bg-white p-2 shadow-[2px_2px_0_rgba(0,0,0,0.85)] ${isClean ? 'opacity-45' : ''}`}>
        <div className="w-16 h-16 shrink-0 bg-[#d8d8d6] border border-black/40 overflow-hidden relative">
          <img src={c.thumb} onError={onImgErr} loading="lazy" className={`w-full h-full object-cover ${c.verdict === 'keep' ? '' : 'grayscale'}`} />
          <span className="absolute top-0 left-0 font-pixel text-[8px] text-white bg-black/70 px-1 leading-tight">{c.score}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-pixel text-[7px] px-1.5 py-0.5 text-white" style={{ background: VERDICT_COLOR[c.verdict] }}>{VERDICT_LABEL[c.verdict]}</span>
            <span className="text-[12px] font-bold truncate">{c.city || '未知地点'}</span>
            {isClean && <span className="font-pixel text-[7px] text-[#d23b3b]">已标记清理</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {c.tags.map((t, i) => (<span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 text-black/60 bg-[#EAEAEA]">{t}</span>))}
          </div>
          <div className="text-[10px] text-black/55 leading-snug mt-1">{c.reason}</div>
          {edgeScored[c.id] && (
            <div className="mt-1 flex items-center gap-1.5 text-[10px]">
              <span className="font-pixel text-[6px] px-1 py-0.5 text-black shrink-0" style={{ background: '#00ff88' }}>端侧实判</span>
              {edgeScored[c.id].busy ? <span className="text-black/45 animate-pulse">端侧看图中…</span>
                : <span className="text-black/70 leading-snug">{edgeScored[c.id].score != null ? <b>{edgeScored[c.id].score} 分</b> : null} · {edgeScored[c.id].reason}</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 py-2.5 border-b-2 border-black bg-black text-[#00ff88] shrink-0">
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>高价值 {curationStats.highValue}</span><span className="opacity-40">|</span>
          <span>待定 {curationStats.review}</span><span className="opacity-40">|</span>
          <span>重复 {curationStats.dupGroups} 组</span><span className="opacity-40">|</span>
          <span>可清理 {curationStats.cleanable}</span>
        </div>
      </div>
      <div className="px-3 py-2 border-b-2 border-black bg-white flex items-center gap-2 shrink-0">
        <div className="flex border-2 border-black bg-[#EAEAEA] p-0.5 flex-1">
          {SEGMENTS.map((s) => (
            <button key={s} onClick={() => setSegment(s)} className={`flex-1 py-1 text-[10px] font-bold ${segment === s ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>{s}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {segment === '整理报告' && (<>
          <button onClick={runEdgeScore} disabled={edgeRunning} className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-[#00ff88] text-black px-2 py-1.5 text-[11px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-50">
            {edgeRunning ? '端侧看图打分中…' : '▶ 端侧看图打分 · 真模型看 3 张'}
          </button>
          {shown.map((c, i) => Card(c, i))}
          {!done && <div className="text-center font-pixel text-[8px] text-black/40 py-2 tracking-widest animate-pulse">端侧整理中… {scanned}/{total}</div>}
        </>)}
        {segment === '重复清理' && (<>
          <div className="flex items-center justify-between bg-white border-2 border-black p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="text-[11px]"><b>{dupGroups.length}</b> 组重复 · 已标记清理 <b>{cleaned.size}</b></div>
            <button onClick={cleanAllDups} className="flex items-center gap-1 border-2 border-black bg-[#d23b3b] text-white px-2 py-1 text-[10px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px"><Trash2 className="w-3 h-3" strokeWidth={2.5} /> 一键清理重复</button>
          </div>
          <div className="font-pixel text-[7px] text-black/40 px-1">清理仅做标记，不会删除你的原图</div>
          {dupGroups.slice(0, 30).map((g, gi) => (
            <div key={g.key + '#' + gi} className="border-2 border-black bg-white p-2 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-pixel text-[8px] text-black/55">{g.photos.length} 张重复 · 保留最高分</span>
                <button onClick={() => cleanGroup(g)} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 active:translate-y-px">清理本组</button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto">
                {g.photos.map((p, pi) => {
                  const keep = p.id === g.keepId; const isClean = cleaned.has(p.id);
                  return (
                    <div key={p.id + '#' + pi} className="relative shrink-0">
                      <div className={`w-14 h-14 border-2 overflow-hidden ${keep ? 'border-[#00aa55]' : 'border-black/40'} ${isClean ? 'opacity-40' : ''}`}>
                        <img src={p.thumb} onError={onImgErr} loading="lazy" className={`w-full h-full object-cover ${keep ? '' : 'grayscale'}`} />
                      </div>
                      <span className="absolute top-0 left-0 font-pixel text-[7px] text-white bg-black/70 px-0.5">{p.score}</span>
                      {keep && <span className="absolute bottom-0 inset-x-0 font-pixel text-[6px] text-center text-white bg-[#00aa55]">保留</span>}
                      {!keep && isClean && <span className="absolute bottom-0 inset-x-0 font-pixel text-[6px] text-center text-white bg-[#d23b3b]">清理</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>)}
        {segment === '高价值' && (<>
          <div className="bg-white border-2 border-black p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)] flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#00e5ff]" strokeWidth={2.5} />
            <div className="text-[11px] leading-snug"><b>{keeps.length}</b> 张高价值照片已钉到地球（tab1）与日历。</div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {keeps.map((c, i) => (
              <div key={c.id + '#' + i} className="aspect-square border-2 border-black overflow-hidden shadow-[1px_1px_0_#000] relative bg-[#d8d8d6]">
                <img src={c.thumb} onError={onImgErr} loading="lazy" className="w-full h-full object-cover" />
                <span className="absolute top-0 left-0 font-pixel text-[7px] text-white bg-black/70 px-0.5">{c.score}</span>
                <span className="absolute bottom-0 inset-x-0 font-pixel text-[6px] text-center text-white bg-black/60 truncate px-0.5">{c.city}</span>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </>
  );
}

// ───────────────────────── 我的照片（真·端侧筛选） ─────────────────────────
type Filter = 'all' | 'keep' | 'review' | 'clean' | 'utility' | 'needplace';
const isUtil = (t: PhotoType) => t === 'screenshot' || t === 'document';
const TYPE_COLOR: Record<PhotoType, string> = {
  place: '#0a7d4a', life: '#0a7d4a', place_nogps: '#7a5a1f',
  screenshot: '#5a5a5a', document: '#5a5a5a', junk: '#888', uncertain: '#c08a00',
};

function RealView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<PhotoResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: '' });
  const [useModel, setUseModel] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [err, setErr] = useState('');
  const [pinned, setPinned] = useState(false);
  const [lessons, setLessons] = useState<string[]>(() => getPrefs().lessons);   // 反思层凝练的经验（越用越懂你）
  // 年月范围（'' = 不限）
  const [fromY, setFromY] = useState(''); const [fromM, setFromM] = useState('');
  const [toY, setToY] = useState(''); const [toM, setToM] = useState('');

  const resultsRef = useRef<PhotoResult[]>([]);
  resultsRef.current = results;
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; resultsRef.current.forEach((r) => URL.revokeObjectURL(r.url)); }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files || []));
    setErr('');
  };

  const run = async () => {
    if (!files.length || running) return;
    results.forEach((r) => URL.revokeObjectURL(r.url));
    setResults([]); setErr(''); setPinned(false); setRunning(true); setProgress({ done: 0, total: files.length, phase: '准备' });
    try {
      const fromYM = fromY && fromM ? +fromY * 12 + (+fromM - 1) : undefined;
      const toYM = toY && toM ? +toY * 12 + (+toM - 1) : undefined;
      const res = await runScreen(files, { fromYM, toYM, useModel, maxAnalyze: 256, modelTopN: 24 },
        (done, total, phase) => setProgress({ done, total, phase }));
      // 若筛选期间组件已卸载（用户返回），这批 objectURL 永远进不了 state 的清理 → 此处主动释放，杜绝泄漏
      if (!mountedRef.current) { res.forEach((r) => URL.revokeObjectURL(r.url)); return; }
      setResults(res);
      if (!res.length) setErr('这批照片里没有落在所选时间段内的（或都无法解析）。换个范围或多选一些试试。');
    } catch (e) {
      if (mountedRef.current) setErr('筛选出错了：' + (e instanceof Error ? e.message : String(e)));
    } finally { if (mountedRef.current) setRunning(false); }
  };

  const stats = useMemo(() => {
    const s = { keep: 0, review: 0, clean: 0, utility: 0, needplace: 0, dup: 0, pin: 0 };
    for (const r of results) {
      if (r.dupOf) s.dup++;
      if (r.pinnable) s.pin++;
      if (isUtil(r.photoType)) s.utility++;
      else if (r.needPlace) s.needplace++;
      else s[r.verdict]++;
    }
    return s;
  }, [results]);

  const shown = useMemo(() => {
    if (filter === 'all') return results;
    if (filter === 'utility') return results.filter((r) => isUtil(r.photoType));
    if (filter === 'needplace') return results.filter((r) => r.needPlace);
    return results.filter((r) => !isUtil(r.photoType) && !r.needPlace && r.verdict === filter);
  }, [results, filter]);

  const pinAll = () => { addPhotoPins(toPins(results.filter((r) => r.pinnable))); setPinned(true); };

  // 纠错：拉回实拍 / 标为资料 / 留 / 清理 —— 写偏好(越用越准)+ 记住(下次同图沿用)
  const correct = (r: PhotoResult, to: 'place' | 'utility' | 'keep' | 'clean') => {
    learnFromOverride(r.photoType, to);
    recordPhotoOverride(r.id, to);
    setResults((prev) => prev.map((x) => {
      if (x.uid !== r.uid) return x;
      const n: PhotoResult = { ...x, userOverride: to };
      if (to === 'place') { n.photoType = x.hasGPS ? 'place' : 'place_nogps'; n.pinnable = x.hasGPS; n.needPlace = !x.hasGPS; n.verdict = 'keep'; }
      else if (to === 'utility') { n.photoType = 'screenshot'; n.pinnable = false; n.needPlace = false; n.verdict = 'review'; }
      else if (to === 'keep') n.verdict = 'keep';
      else if (to === 'clean') { n.verdict = 'clean'; n.pinnable = false; }
      return n;
    }));
    setLessons(getPrefs().lessons);   // 纠正后反思层可能凝练出新经验，刷新展示
  };

  const dateStr = (d: Date | null) => d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '无日期';

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 控制台 */}
      <div className="px-3 pt-3 pb-2 space-y-2.5 border-b-2 border-black bg-white">
        {/* 时间段 */}
        <div className="border-2 border-black p-2.5 bg-[#EAEAEA]">
          <div className="font-pixel text-[8px] tracking-widest text-black/50 mb-1.5">时间段（按 EXIF 拍摄日期 · 不选=不限）</div>
          <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
            <span className="text-black/50">从</span>
            <select value={fromY} onChange={(e) => setFromY(e.target.value)} className="border-2 border-black bg-white px-1 py-1 text-[11px]"><option value="">年</option>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>
            <select value={fromM} onChange={(e) => setFromM(e.target.value)} className="border-2 border-black bg-white px-1 py-1 text-[11px]"><option value="">月</option>{MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            <span className="text-black/50">到</span>
            <select value={toY} onChange={(e) => setToY(e.target.value)} className="border-2 border-black bg-white px-1 py-1 text-[11px]"><option value="">年</option>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>
            <select value={toM} onChange={(e) => setToM(e.target.value)} className="border-2 border-black bg-white px-1 py-1 text-[11px]"><option value="">月</option>{MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </div>
        </div>
        {/* 选图 + 选项 */}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 border-2 border-black bg-white px-2 py-2 text-[12px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px">
            <Upload className="w-4 h-4" strokeWidth={2.5} /> {files.length ? `已授权 ${files.length} 张 · 重选` : '选择照片 / 授权相册'}
          </button>
        </div>
        {!files.length && (
          <div className="text-[10.5px] text-black/55 leading-relaxed border-l-2 border-[#00aa55] pl-2">
            点开后在系统相册里 <b>多选 / 全选</b>——选中即把这批照片<b>授权</b>给端侧分析。
            <span className="text-black/40">iOS 不给网页「常驻全相册」权限（那是原生 App 才有的），只能这样逐次选；但选中的照片是真读真分析。</span>
          </div>
        )}
        <label className="flex items-center gap-2 text-[11px] cursor-pointer select-none">
          <input type="checkbox" checked={useModel} onChange={(e) => setUseModel(e.target.checked)} className="w-4 h-4 accent-black" />
          <Sparkles className="w-3.5 h-3.5 text-[#c08a00]" strokeWidth={2.5} />
          用端侧 AI 模型精筛 top（首次需下载模型，之后缓存；不勾=纯快速分析，秒出）
        </label>
        <button onClick={run} disabled={!files.length || running}
          className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-[#00ff88] text-black px-2 py-2.5 text-[13px] font-bold shadow-[3px_3px_0_#000] active:translate-y-px disabled:opacity-40">
          {running ? '端侧筛选中…' : '▶ 一键开始筛选'}
        </button>
        <div className="font-pixel text-[7px] text-black/40 leading-relaxed">全程在你手机本地完成 · 原图一步都不出手机 · 只产出分数/标签</div>
      </div>

      {/* 进度 */}
      {running && (
        <div className="px-3 py-3 bg-[#EAEAEA] border-b-2 border-black">
          <div className="font-pixel text-[8px] tracking-widest text-black/55 mb-1.5">{progress.phase} · {progress.done}/{progress.total}</div>
          <div className="h-3 border-2 border-black bg-white overflow-hidden">
            <div className="h-full bg-[#00ff88] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total * 100) : 0}%` }} />
          </div>
        </div>
      )}

      {err && <div className="m-3 border-2 border-[#d23b3b] bg-[#fff0f0] text-[#a02020] text-[11px] p-2.5 leading-relaxed">{err}</div>}

      {/* 结果 */}
      {results.length > 0 && !running && (
        <>
          <div className="px-4 py-2.5 border-b-2 border-black bg-black text-[#00ff88]">
            <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
              <span>留 {stats.keep}</span><span className="opacity-40">|</span>
              <span>待定 {stats.review}</span><span className="opacity-40">|</span>
              <span>清 {stats.clean}</span><span className="opacity-40">|</span>
              <span>资料 {stats.utility}</span><span className="opacity-40">|</span>
              <span>待补 {stats.needplace}</span>
            </div>
          </div>

          {/* 反思记忆：从你历次纠正里凝练的经验（仅展示；判定由端侧纠错统计的软偏置驱动） */}
          {lessons.length > 0 && (
            <div className="px-3 py-2.5 border-b-2 border-black bg-[#FFF8E6]">
              <div className="font-pixel text-[7px] tracking-widest text-[#7a5a1f] mb-1.5 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-[#c08a00]" strokeWidth={2.5} /> 我从你的纠正里学到的（越用越懂你）
              </div>
              <ul className="space-y-1">
                {lessons.map((t, i) => (
                  <li key={i} className="text-[10.5px] text-[#5a4510] leading-snug flex gap-1.5">
                    <span className="text-[#c08a00] shrink-0">·</span><span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 钉到地球：只钉实拍·有真坐标·簇代表 */}
          <div className="px-3 py-2.5 border-b-2 border-black bg-[#EAF7EE]">
            <button onClick={pinAll} disabled={!stats.pin || pinned}
              className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-[#0a7d4a] text-white px-2 py-2 text-[12px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-40">
              <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} />
              {pinned ? `✓ 已钉 ${stats.pin} 张到地球` : stats.pin ? `▶ 把 ${stats.pin} 张地方照片钉到地球` : '没有可钉的照片（需实拍且带坐标）'}
            </button>
            {!!stats.needplace && <div className="text-[10px] text-[#7a5a1f] mt-1.5 leading-snug">另有 {stats.needplace} 张实拍但没坐标，归到「待补地点」，以后补地名再钉。</div>}
          </div>

          <div className="px-3 py-2 border-b-2 border-black bg-white">
            <div className="grid grid-cols-6 border-2 border-black bg-[#EAEAEA] p-0.5 gap-0.5">
              {([['all', '全部'], ['keep', '留'], ['review', '待定'], ['clean', '清'], ['utility', '资料'], ['needplace', '待补']] as [Filter, string][]).map(([f, label]) => (
                <button key={f} onClick={() => setFilter(f)} className={`py-1 text-[10px] font-bold ${filter === f ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="px-3 py-3 space-y-2.5">
            {shown.map((r) => (
              <div key={r.uid} className={`flex gap-2.5 border-2 border-black bg-white p-2 shadow-[2px_2px_0_rgba(0,0,0,0.85)] ${r.verdict === 'clean' ? 'opacity-60' : ''}`}>
                <div className="w-16 h-16 shrink-0 bg-[#d8d8d6] border border-black/40 overflow-hidden relative">
                  <img src={r.url} loading="lazy" className={`w-full h-full object-cover ${r.verdict === 'keep' ? '' : 'grayscale-[.4]'}`} />
                  <span className="absolute top-0 left-0 font-pixel text-[8px] text-white bg-black/70 px-1 leading-tight">{r.valueScore}</span>
                  {r.pinnable && <span className="absolute bottom-0 right-0 bg-[#0a7d4a] text-white px-0.5 py-px leading-none"><MapPin className="w-2.5 h-2.5" strokeWidth={3} /></span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-pixel text-[7px] px-1.5 py-0.5 text-white" style={{ background: TYPE_COLOR[r.photoType] }}>{TYPE_LABEL[r.photoType]}</span>
                    <span className="font-pixel text-[7px] px-1.5 py-0.5 text-white" style={{ background: RV_COLOR[r.verdict] }}>{RV_LABEL[r.verdict]}</span>
                    <span className="text-[11px] text-black/55 truncate">{dateStr(r.date)} · {r.w}×{r.h}</span>
                  </div>
                  {!!r.tags.length && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.tags.map((t, i) => (<span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 text-black/60 bg-[#EAEAEA]">{t}</span>))}
                    </div>
                  )}
                  <div className="text-[10px] text-black/45 mt-1 leading-snug">{r.reason}</div>
                  {r.dupOf && <div className="text-[10px] text-[#d23b3b] mt-0.5">与已保留的某张重复 · 建议清理（不删原图）</div>}
                  {/* 纠错：点一下越用越准，并对同图永久记住 */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {isUtil(r.photoType)
                      ? <button onClick={() => correct(r, 'place')} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-[#EAF7EE] active:translate-y-px">其实是实拍</button>
                      : <button onClick={() => correct(r, 'utility')} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-[#f1f1f1] active:translate-y-px">其实是资料</button>}
                    {r.verdict !== 'keep' && <button onClick={() => correct(r, 'keep')} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white active:translate-y-px">留</button>}
                    {r.verdict !== 'clean' && <button onClick={() => correct(r, 'clean')} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white active:translate-y-px">清理</button>}
                    {r.userOverride && <span className="font-pixel text-[7px] px-1 py-0.5 text-[#0a7d4a]">✓ 已按你的纠正</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 空态引导 */}
      {!results.length && !running && !err && (
        <div className="px-4 py-8 text-center text-black/45 text-[12px] leading-relaxed">
          选一批你自己的照片，设个时间段，点「开始筛选」。<br />
          端侧逐张看：清晰度、曝光、色彩、查重，挑出值得留的。<br />
          <span className="font-pixel text-[8px] text-black/35 tracking-wide">原图不出手机 · iOS 上点选即从系统相册多选</span>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── 外壳 ─────────────────────────
export default function PhotosCuratorRunPage({ onBack }: Props) {
  const [mode, setMode] = useState<'real' | 'demo'>('real');
  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans relative overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">PHOTOS-CURATOR</div>
          <div className="text-[9px] text-black/45 truncate">端侧整理 · 原图不出手机</div>
        </div>
        <div className="flex border-2 border-black bg-[#EAEAEA] p-0.5 shrink-0">
          <button onClick={() => setMode('real')} className={`px-2 py-1 text-[9px] font-bold ${mode === 'real' ? 'bg-black text-[#7CFF6B]' : 'text-black'}`}>我的照片</button>
          <button onClick={() => setMode('demo')} className={`px-2 py-1 text-[9px] font-bold ${mode === 'demo' ? 'bg-black text-[#7CFF6B]' : 'text-black'}`}>示例</button>
        </div>
      </div>
      {mode === 'real' ? <RealView /> : <DemoView />}
    </div>
  );
}
