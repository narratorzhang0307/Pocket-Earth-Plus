// 记忆中枢 · 读装配（L1 总 FROST 长期记忆的统一读出口）。
// 取代各 agent 手工拼 getProfileSummary + getTasteSummary：一行 assembleMemory() 把
//   【口味气质叙事 + 按评分偏爱口味 + 长期标签画像】+「记忆即空气」规则
// 拼成注入云脑 system 的记忆块。只读现成端侧记忆、绝不触发云脑；新增 agent 统一走这里，杜绝漏接。
//
// 放应用层（不放 frost-agent 内核）——它要同时聚合内核的 profile 与应用层的 taste，
// 放内核会造成「内核反向依赖应用」破坏分层；这里依赖方向是 应用→内核，正确。
// 不碰 router/intentRegistry/validator 的封闭枚举，纯文本组装。
import { getProfileSummary, getCachedTasteLine, summarizeTaste } from '../../../frost-agent/harness/profile';
import { getFrostBrain } from '../../../frost-agent/harness/brain';
import { getTasteSummary } from './taste';
import { getMoodTrace } from './mood/retrospect';

// 「记忆即空气」注入规则（抄 OpenHanako）：用记忆但不出戏、不谄媚、冲突以当前对话为准。
export const MEMORY_AIR_RULES =
  '【关于以下记忆】这是跨会话沉淀下来的、你对这位用户的了解。自然融进回答即可：' +
  '不要把它当对话内容复述、不要说「我记得 / 你之前说过 / 根据你的记忆」这类话；' +
  '若它和用户当前这句话冲突，一律以当前对话为准；绝不用旧记忆去纠正或反驳用户。';

// 复盘「该捕获 vs 绝不捕获」规则（抄 Hermes 三段 review）——P0 先定义，供 P1 会话结束旁路复盘调用。
export const MEMORY_CAPTURE_RULES =
  '判断要不要把这次交互沉淀进长期画像：' +
  '【该捕获】用户对风格 / 口味 / 流程的稳定偏好与明确纠正（如「我更爱冷门小众」「别老推荐商业大片」）。' +
  '【绝不捕获】一次性任务叙事、临时进度、瞬时错误、对某功能的负面断言（会硬化成日后反咬自己的自缚约束）、' +
  '以及容易随时重新获得的事实。「这次没什么值得记的」是完全合法、且大多数时候应是默认结论。';

// 让「一句话口味气质」叙事层在主路径生效（此前只有打开广场页才触发，平时 narrative 多半是空的）：
// 有画像就 fire-and-forget 触发 summarizeTaste 填充/刷新缓存（内部已有 fingerprint 缓存：口味没变则 skip 云脑）。
// 本次仍读旧缓存（同步、不阻塞），刷新供下次 assembleMemory 用。
let narrPending = false;
export function ensureNarrative(): void {
  if (narrPending || !getProfileSummary()) return;
  narrPending = true;
  summarizeTaste(getFrostBrain()).catch(() => {}).finally(() => { narrPending = false; });
}

/** 读装配：拼出注入云脑 system 的记忆块。无任何记忆时返回空串（连规则也不注入，省 token）。
 *  opts.domain 预留（按域附本地领域摘要）。 */
export function assembleMemory(_opts?: { domain?: string }): string {
  ensureNarrative();                    // 后台保鲜叙事层（不阻塞，本次用已缓存的）
  const parts: string[] = [];
  const line = getCachedTasteLine();    // L1 叙事：一句话口味气质（已缓存，不触发云脑）
  const loved = getTasteSummary();      // L2 按评分的偏爱口味视图（taste.ts）
  const moodTrace = getMoodTrace();     // L3 情绪足迹（独立 mood 通道，读 geoStickers，不走 ProfileDomain）
  const profile = getProfileSummary();  // L4 标签画像
  if (line) parts.push(`# 你的口味气质（一句话）\n${line}`);
  if (loved) parts.push(loved);
  if (moodTrace) parts.push(moodTrace);
  if (profile) parts.push(profile);
  if (!parts.length) return '';
  return `${MEMORY_AIR_RULES}\n\n${parts.join('\n\n')}`;
}
