// Frost Harness · Router（总控）
// 混合路由：① 明确指令由 switch-handler 正则秒回（省钱省延迟）；
// ② 其余交给 LLM 大脑读懂自然语言、判断意图 + 抽城市（泛化，接得住没预料到的问法）；
// ③ 大脑不可用时回退规则路由。子 agent 只建议动作 → Validator 校验 → 返回。
import { AgentResult, FrostContext, FrostIntent } from './types';
import { validateActions } from './validator';
import { runSwitchHandler } from '../agents/switch-handler';
import { runGeneral } from '../agents/general';
import { getIntentHandler } from './intentRegistry';
import { llmRoute } from './llmRoute';
import { httpEdge } from '../edge/httpEdge';
import { recordHealth } from './health';

// 端侧可预分类的意图（switch 需抽城，留给正则秒回 / 云脑，不交端侧）
const EDGE_INTENTS: FrostIntent[] = ['tour', 'open_dj', 'city_culture', 'chitchat', 'general'];

const TOUR = /(日落|跟着.*走|跟随日落|巡游|环游|哪.*在日落|正在日落)/;
const CULTURE = /(是谁|介绍一下|讲讲|为什么|什么样|历史|文化|背后|这位作家|这座城)/;
const SCENE = /(在读|在看|读到|心情|像.*的|场景|今天|出门|自驾|开车|失眠|异乡|海边|主题电台|歌单|策展|推荐.*歌)/;

/** 规则兜底路由（大脑不可用时用）。 */
function routeRegex(t: string): FrostIntent {
  if (TOUR.test(t)) return 'tour';
  if (SCENE.test(t)) return 'open_dj';
  if (CULTURE.test(t)) return 'city_culture';
  return 'general';
}

/** 按意图委派：走意图注册表查处理器；未注册的意图回退 general。city 为 LLM 抽到的城市（switch 用）。 */
async function dispatch(intent: FrostIntent, ctx: FrostContext, city?: string): Promise<AgentResult> {
  const handler = getIntentHandler(intent);
  if (handler) return handler(ctx, { city });
  return runGeneral(ctx);
}

/** Frost 总入口：① 指令秒回 → ② 大脑路由 → ③ 规则兜底；委派 → 校验动作 → 返回。 */
export async function runFrost(ctx: FrostContext): Promise<AgentResult & { intent: FrostIntent }> {
  let intent: FrostIntent;
  let result: AgentResult;
  let routeTrace: string[];

  // ① 明确指令：switch-handler 能匹配就走它（不花大脑）
  const fast = runSwitchHandler(ctx);
  if (fast.data.matched) {
    intent = 'switch';
    result = fast;
    routeTrace = ['Router → 指令手（规则秒回，未动用大脑）'];
  } else {
    // ①bis 端侧意图预分类：端侧粗分挡在云路由前，命中合法意图就秒回、不动云脑（省 token + 提速）
    let edgeIntent = '';
    try { edgeIntent = await httpEdge.classify(ctx.userText || '', EDGE_INTENTS as string[]); recordHealth('route.edge', true); }
    catch (e) { edgeIntent = ''; recordHealth('route.edge', false, String(e)); }
    if (edgeIntent && (EDGE_INTENTS as string[]).includes(edgeIntent)) {
      intent = edgeIntent as FrostIntent;
      result = await dispatch(intent, ctx);
      routeTrace = [`Router·端侧预分类 → 意图: ${intent}（端侧挑，未动用云脑）`];
    } else {
      // ② 云脑路由（端侧未就绪 / 没把握时的长尾）
      const lr = await llmRoute(ctx);
      recordHealth('route.cloud', !!lr, lr ? undefined : '云脑不可用');
      if (lr) {
        intent = lr.intent;
        result = await dispatch(intent, ctx, lr.city);
        routeTrace = [
          `Router·大脑 → 意图: ${intent}${lr.city ? ' · ' + lr.city : ''}`,
          lr.reason ? `判断: ${lr.reason}` : '已读懂用户意图并委派',
        ];
      } else {
        // ③ 大脑不可用 → 规则兜底
        intent = routeRegex(ctx.userText || '');
        result = await dispatch(intent, ctx);
        routeTrace = [`Router·规则兜底 → 意图: ${intent}（大脑未接入）`];
      }
    }
  }

  // Boundary：只放行合法动作
  const { valid } = validateActions(result.radioActions);
  // 把路由痕迹拼到子 agent 自己的痕迹前面，让思考过程可见
  const trace = [...routeTrace, ...(result.trace || [])];
  return { ...result, radioActions: valid, trace, intent };
}
