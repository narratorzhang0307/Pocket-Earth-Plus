// 自定义 agent 工厂 · 拟稿层（meta-agent 的「造」）。
// 用户一句话 → Qwen 产出一份待审查的【声明式 manifest】。
//   - 默认走云脑 getFrostBrain()（现已是 Qwen，JSON 稳）；
//   - onEdge=true 且端侧就绪时改走浏览器内 Qwen（edgeSafe.chat）——这就是「端侧自己长出新 agent」。
// 产出未经安装，必须再过 reviewManifest 安全闸（registry.installAgent 内置）。
import { getFrostBrain } from '../../../../frost-agent/harness/brain';
import { edgeSafe } from '../../../../frost-agent/edge/contract';
import { GEO_STRATEGIES, ALLOWED_TOOLS, CARD_STYLES, type AgentManifest } from './manifest';

function buildPrompt(desc: string): string {
  return [
    `用户想造一个用来整理某类个人对象、并把它们钉到地球上的小 agent。用户的描述：「${desc}」。`,
    `请据此设计一份声明式 manifest，只输出纯 JSON（不要解释、不要代码、不要 Markdown 代码块、不要任何链接）：`,
    `{`,
    `  "name": "≤20字的中文 agent 名",`,
    `  "emoji": "一个最贴切的 emoji",`,
    `  "domain": "≤12字，整理对象，如 咖啡馆 / 球鞋 / 鸟类",`,
    `  "desc": "≤40字一句话说明它做什么",`,
    `  "keywords": ["触发词", "2到6个", "≤12字"],`,
    `  "geoStrategy": ["从 ${GEO_STRATEGIES.join('/')} 里按优先级挑1到3个：这类对象最该钉到地球哪里"],`,
    `  "tagFields": ["该给这类对象打哪些标签字段", "3到6个", "如 产地/风格/打卡城市"],`,
    `  "tools": ["从 ${ALLOWED_TOOLS.join('/')} 里挑，通常 enrich,geocode,mark_place"],`,
    `  "cardStyle": "从 ${CARD_STYLES.join('/')} 里挑一个最配的卡片样式",`,
    `  "color": "#rrggbb 一个代表色",`,
    `  "persona": "≤40字，这个 agent 说话的口吻"`,
    `}`,
  ].join('\n');
}

function parseJson(raw: string): Partial<AgentManifest> | null {
  if (!raw) return null;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : raw) as Partial<AgentManifest>;
  } catch { return null; }
}

/** 拟一份待审查的 manifest（失败返回 null）。onEdge 且端侧就绪时用浏览器内 Qwen。 */
export async function proposeManifest(desc: string, opts?: { onEdge?: boolean }): Promise<{ draft: Partial<AgentManifest> | null; via: 'edge' | 'cloud' | 'none' }> {
  const d = desc.trim();
  if (!d) return { draft: null, via: 'none' };
  const prompt = buildPrompt(d);

  if (opts?.onEdge && (await edgeSafe.available())) {
    const raw = await edgeSafe.chat(prompt, { json: true });
    const draft = parseJson(raw);
    if (draft) return { draft, via: 'edge' };
    // 端侧吐不出合法 JSON → 回退云脑
  }
  let raw = '';
  try { raw = (await getFrostBrain().complete(prompt, { json: true })) || ''; } catch { raw = ''; }
  const draft = parseJson(raw);
  return { draft, via: draft ? 'cloud' : 'none' };
}
