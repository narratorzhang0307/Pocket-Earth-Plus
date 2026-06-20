// 推理层：按喜好/画像给 POI 排序 + 分天。
// 排序三级（隐私边界见 profile.ts：画像只走云脑；端侧只按旅行偏好、绝不碰画像；本地命中度兜底）：
//   ① 云脑（/api/frost-llm）注入跨域画像 → 按「你的口味」挑（线上主力，真实有效）
//   ② 端侧真后端（edgeSafe.available() 非 stub 才信）→ 按旅行偏好挑（不碰画像，合规）
//   ③ 本地命中度 → prefs.includes(tag) 确定性兜底
// 关键修正：旧 TravelRunPage 直接信 edgeSafe.rank，但线上 /api/edge 默认 stub 返回「线性递减假分」，
// 导致线上其实没按画像/偏好挑、只按 catalog 原始顺序排。这里改为 available() 判 stub + 云脑优先。
import { edgeSafe } from '../../../../frost-agent/edge/contract';
import type { Destination, Pref, DayPlan, PlanMode } from './types';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });
}

// 从 LLM 文本里抠出第一个 JSON 对象（容忍 ```json 包裹与前后废话）。抄 movie/tagging。
function extractJSON(text: string): unknown | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const s = body.indexOf('{'); const e = body.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(body.slice(s, e + 1)); } catch { return null; }
}

// ① 云脑画像排序：注入跨域长期画像，返回与候选同序的 0-1 分数数组；任何不达标 → null（交回上层降级）。
export async function cloudRankPOIs(dest: Destination, prefs: Pref[], memoryBlock: string): Promise<number[] | null> {
  const cand = dest.pois.map((p, i) => `${i}. ${p.name}（${p.tag}）${p.note}`);
  const system = '你是私人旅行选址助手。给定这位用户的长期口味画像 + 本次旅行偏好 + 候选地点，'
    + '为每个候选打一个 0~1 的「适合这位用户」分（越懂他越高）。要结合画像里的电影/读书/音乐气质做迁移判断：'
    + '偏爱文艺/历史/作者电影的人，博物馆、老城、书店类给更高分；爱热闹/夜生活的，夜市、酒吧街给更高分；偏小众的，避开最大众的打卡点。'
    + '只输出一个 JSON：{"scores":[按候选编号顺序的分数数组]}，数组长度必须严格等于候选数，不要任何解释或代码块标记。';
  const prompt = `${memoryBlock || '（暂无长期画像，仅按本次偏好）'}\n\n本次旅行偏好：${prefs.join('、') || '随便逛逛'}\n目的地：${dest.name}\n候选地点：\n${cand.join('\n')}\n请输出 scores JSON。`;
  try {
    const ac = new AbortController();
    const r = await withTimeout(fetch('/api/frost-llm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, system, json: true }),
      signal: ac.signal,
    }), 20000).catch((e) => { ac.abort(); throw e; });   // 超时/失败时主动断掉在途 fetch，不留挂起请求
    const data = await r.json();
    const obj = extractJSON(String(data?.text || '')) as { scores?: unknown } | null;
    const arr = obj?.scores;
    if (!Array.isArray(arr) || arr.length !== dest.pois.length) return null;
    const nums = arr.map((x) => (typeof x === 'number' ? x : (typeof x === 'string' ? parseFloat(x) : NaN)));
    if (nums.some((n) => !isFinite(n))) return null;
    return nums.map((n) => Math.max(0, Math.min(1, n)));   // 钳到 0-1，防越界
  } catch { return null; }
}

// ② 端侧真后端排序：仅当 available() 为真（非 stub、非离线）才信；只按旅行偏好、不注入画像（隐私边界）。
async function edgeRankPOIs(dest: Destination, prefs: Pref[]): Promise<number[] | null> {
  try {
    if (!(await edgeSafe.available())) return null;   // stub / 离线 → 跳过，绝不用线性递减假分
    const cand = dest.pois.map((p) => `${p.name}（${p.tag}）${p.note}`);
    const s = await edgeSafe.rank(`我的旅行偏好：${prefs.join('、') || '随便逛逛'}`, cand);
    return (s.length === dest.pois.length && s.some((x) => x > 0)) ? s : null;
  } catch { return null; }
}

// 排序总入口：三级降级。返回分数（可空）+ 实际来源 mode（对用户透明）。
export async function rankPOIs(dest: Destination, prefs: Pref[], memoryBlock: string): Promise<{ scores: number[] | null; mode: PlanMode }> {
  const cloud = await cloudRankPOIs(dest, prefs, memoryBlock);
  if (cloud) return { scores: cloud, mode: '云脑' };
  const edge = await edgeRankPOIs(dest, prefs);
  if (edge) return { scores: edge, mode: '端侧' };
  return { scores: null, mode: '本地' };
}

// 分天计划：按（排序分×3 + 本地命中×2 + 原序微扰）排序，再按每天 3 站切分。保留原 travel.ts 逻辑。
export function planTrip(dest: Destination, prefs: Pref[], days: number, scores?: number[]): DayPlan[] {
  const scored = dest.pois.map((p, i) => {
    const edge = scores && scores.length === dest.pois.length ? scores[i] : 0;
    const local = prefs.includes(p.tag) ? 2 : 0;
    return { p, s: edge * 3 + local + (dest.pois.length - i) * 0.01 };
  }).sort((a, b) => b.s - a.s);
  const perDay = 3;
  const picked = scored.slice(0, Math.max(perDay, Math.min(dest.pois.length, days * perDay))).map((x) => x.p);
  const plans: DayPlan[] = [];
  for (let d = 0; d < days; d++) {
    const stops = picked.slice(d * perDay, d * perDay + perDay);
    if (stops.length) plans.push({ day: d + 1, stops });
  }
  return plans;
}
