import { useState, useEffect } from 'react';
import { ChevronLeft, Wand2, Check, X, Trash2, Play } from 'lucide-react';
import { proposeSkill, reviewSkill, installSkill, getLearnedSkills, subscribeSkills, removeLearnedSkill, ALLOWED_TARGETS, type LearnedSkill, type Review } from '../../../frost-agent/harness/skillForge';

// skill-forge 运行页（P2-I）：教 frost 学一个新技能。
// 你一句话描述 → 云脑拟一份【声明式技能清单】→ 过【安全审查闸】(白名单路由 / 禁代码) → 安装。
// 装好的技能 = 触发词 → 路由到已有 agent 的快捷方式（不执行任何代码）。

interface Props { onBack: () => void; onRun: (target: string) => void }
const ACCENT = '#7c8cff'; // 靛蓝，区别于其它页

export default function SkillForgePage({ onBack, onRun }: Props) {
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<LearnedSkill> | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [err, setErr] = useState('');
  const [skills, setSkills] = useState<LearnedSkill[]>(getLearnedSkills());
  useEffect(() => subscribeSkills(() => setSkills([...getLearnedSkills()])), []);

  const generate = async () => {
    const d = desc.trim();
    if (!d || busy) return;
    setBusy(true); setDraft(null); setReview(null); setErr('');
    const m = await proposeSkill(d);
    setBusy(false);
    if (!m) { setErr('云脑未就绪或拟稿失败（需配置 DASHSCOPE_API_KEY）。'); return; }
    setDraft(m); setReview(reviewSkill(m));
  };

  const install = () => {
    if (!draft) return;
    const r = installSkill(draft);
    setReview(r);
    if (r.ok) { setDraft(null); setDesc(''); }
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">SKILL-FORGE</div>
          <div className="text-[9px] text-black/45 leading-tight mt-0.5">教 frost 学一个新技能</div>
        </div>
        <Wand2 className="w-4 h-4" strokeWidth={2.5} style={{ color: ACCENT }} />
      </div>

      {/* Stat strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black shrink-0" style={{ color: ACCENT }}>
        <div className="font-pixel text-[8px] flex justify-center items-center gap-3 tracking-widest">
          <span>已学 {skills.length}</span><span className="opacity-40">·</span><span>声明式 · 安全闸</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* 描述 → 生成 */}
        <div className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
            placeholder="想教 frost 做什么？例：每晚给我来一单深夜钢琴"
            className="w-full border-2 border-black px-2.5 py-2 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white resize-none" />
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[9px] text-black/45 leading-snug flex-1">云脑拟稿 → 安全审查闸 → 你确认才安装；技能只会路由到已有 agent，不执行任何代码。</span>
            <button onClick={generate} disabled={busy || !desc.trim()}
              className="flex items-center gap-1 border-2 border-black px-3 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-white disabled:opacity-40" style={{ background: ACCENT }}>
              {busy ? '拟稿中…' : '生成 ✦'}
            </button>
          </div>
        </div>

        {err && <div className="border-2 border-black bg-[#ffecec] text-[#b00] text-[11px] p-2.5">{err}</div>}

        {/* 草案 + 安全审查 */}
        {draft && review && (
          <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="font-pixel text-[8px] tracking-widest mb-1.5" style={{ color: ACCENT }}>◍ 草案 · 待安全审查</div>
            <div className="text-[13px] font-bold">{String(draft.name || '(无名)')}</div>
            <div className="text-[11px] text-black/60 leading-snug mt-0.5">{String(draft.desc || '')}</div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(draft.keywords || []).map((k, i) => <span key={i} className="text-[9px] border border-black px-1.5 py-0.5 bg-[#EAEAEA]">{String(k)}</span>)}
            </div>
            <div className="text-[10px] text-black/55 mt-2">路由到：<b>{String(draft.target || '?')}</b>{draft.target && ALLOWED_TARGETS[String(draft.target)] ? `（${ALLOWED_TARGETS[String(draft.target)]}）` : ''}</div>
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
              安装这个技能
            </button>
          </div>
        )}

        {/* 已学技能 */}
        <div className="flex items-center gap-1.5 px-0.5 pt-1">
          <span className="font-pixel text-[8px] tracking-widest text-black/55">已学技能 · LEARNED</span>
        </div>
        {skills.length === 0 && <div className="text-[11px] text-black/40 px-0.5">还没有学到的技能。上面描述一句，让 frost 学第一个。</div>}
        {skills.map((s) => (
          <div key={s.id} className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold truncate">{s.name}</div>
                <div className="text-[10px] text-black/55 leading-tight truncate">{s.desc || ALLOWED_TARGETS[s.target] || s.target}</div>
              </div>
              <button onClick={() => onRun(s.target)} className="shrink-0 flex items-center gap-1 border-2 border-black px-2 py-1 font-pixel text-[8px] text-white active:translate-y-px" style={{ background: ACCENT }}>
                <Play className="w-3 h-3" strokeWidth={3} />运行
              </button>
              <button onClick={() => removeLearnedSkill(s.id)} className="shrink-0 w-7 h-7 border-2 border-black bg-white flex items-center justify-center active:translate-y-px">
                <Trash2 className="w-3.5 h-3.5 text-black/55" strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {s.keywords.slice(0, 6).map((k, i) => <span key={i} className="text-[9px] border border-black px-1.5 py-0.5 bg-[#EAEAEA]">{k}</span>)}
              <span className="text-[9px] text-black/45 self-center">→ {ALLOWED_TARGETS[s.target] || s.target}</span>
            </div>
          </div>
        ))}

        <div className="text-center text-[8px] font-pixel text-black/30 py-1.5 tracking-widest leading-relaxed">
          技能为声明式路由 · 安全闸禁任意代码<br />真·代码自进化为前瞻
        </div>
      </div>
    </div>
  );
}
