// 编排层：B 线规划流水线（读画像 → 三级排序 → 分天）。onPhase 回调供 UI 显示进度。舱壁降级不抛错。
// 对齐 movie/agent.ts：组件只调 runPlan，业务逻辑全在 lib（组件薄、lib 厚）。
import { assembleMemory } from '../memoryRouter';
import { destination, DESTINATIONS } from './catalog';
import { rankPOIs, planTrip } from './plan';
import { ocrShots } from './sense';
import { structureTrip } from './tagging';
import type { PlanInput, TripPlan, OnTravelPhase, TripArchive, OnArchivePhase } from './types';

export async function runPlan(input: PlanInput, onPhase?: OnTravelPhase): Promise<TripPlan> {
  const ph = onPhase || (() => {});
  const dest = destination(input.destName) || DESTINATIONS[0];

  // ① 读跨域长期画像（电影/读书/音乐+travel）——只会被「云脑」那一级注入，端侧不碰（隐私边界）
  ph('读取你的长期口味', '本地画像');
  const memoryBlock = assembleMemory({ domain: 'travel' });

  // ② 三级排序：云脑按画像挑 → 端侧真后端按偏好挑 → 本地命中度兜底（算完才知用了哪级 → 带 mode badge 一次性发）
  const { scores, mode } = await rankPOIs(dest, input.prefs, memoryBlock);
  ph('按你的口味挑地点', mode);

  // ③ 分天
  const days = planTrip(dest, input.prefs, input.days, scores || undefined);
  ph('完成');
  return { dest, days, mode };
}

// A 线（截图提炼）编排：端侧 vision 读票据 → 端侧脱敏 → 云脑结构化 → TripArchive 草稿。
// 端侧未就绪（线上 stub / 没加载浏览器模型）→ reason='noEdge'，UI 引导加载端侧或走手动录入。
export async function runArchive(imageDataUrls: string[], onPhase?: OnArchivePhase): Promise<{ archive: TripArchive | null; shots: number; reason?: 'noEdge' | 'noStructure' }> {
  const ph = onPhase || (() => {});
  ph('端侧读票据');
  const shots = await ocrShots(imageDataUrls, (d, n) => ph(`端侧读票据 ${d}/${n}`));
  if (!shots.length) return { archive: null, shots: 0, reason: 'noEdge' };
  ph('整理成行程', '云脑结构化');
  const archive = await structureTrip(shots);
  ph('完成');
  return { archive, shots: shots.length, reason: archive ? undefined : 'noStructure' };
}

export { confirmTrip, pinManualStop, confirmArchive } from './pin';
