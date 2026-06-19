// 自定义 agent 工厂 · 注册表（已安装 agent 的 store）。
// localStorage + 发布订阅（与 userMarks/planets 同思路，纯端上、无后端）。
// 安装必过 reviewManifest 安全闸；装好的 agent 出现在控制台、可运行。
import { reviewManifest, type AgentManifest, type ManifestReview } from './manifest';

const KEY = 'pe.customAgents.v1';

function load(): AgentManifest[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as AgentManifest[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

let agents: AgentManifest[] = load();
const subs = new Set<() => void>();
function persist() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(agents)); } catch { /* ignore */ } }
function emit() { subs.forEach((fn) => fn()); }

export function getCustomAgents(): AgentManifest[] { return agents; }
export function getCustomAgent(id: string): AgentManifest | undefined { return agents.find((a) => a.id === id); }
export function subscribeCustomAgents(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

function slug(name: string): string {
  // 中文名也能得到稳定 id：先尝试英数 slug，空则用时间戳基数。
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return base || 'agent';
}

/** 安装一份 manifest：过安全闸 → 落地。返回审查结果（不 ok 则未安装）。 */
export function installAgent(m: Partial<AgentManifest>): { review: ManifestReview; installed: AgentManifest | null } {
  // 补默认值（让审查针对完整对象）：createdAt 由系统给，id 安装时生成。
  const candidate: Partial<AgentManifest> = { ...m };
  delete candidate.id; delete candidate.createdAt;
  const review = reviewManifest({ ...candidate, id: 'x', createdAt: new Date().toISOString() });
  if (!review.ok) return { review, installed: null };

  let id = slug(candidate.name!); let n = 1;
  while (agents.some((a) => a.id === id)) id = `${slug(candidate.name!)}-${++n}`;
  const installed: AgentManifest = { ...(candidate as AgentManifest), id, createdAt: new Date().toISOString() };
  agents = [installed, ...agents];
  persist(); emit();
  return { review, installed };
}

export function removeCustomAgent(id: string): void {
  agents = agents.filter((a) => a.id !== id);
  persist(); emit();
}
