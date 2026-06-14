// 通用兜底 · 接住任何没有专门 skill 对应的问题（电台能做什么、世界常识、随口聊…）
// 优先真实大脑作答；stub/出错时给 Frost 声音的体面 fallback，并自然引到能做的事。
import { AgentResult, FrostContext } from '../../harness/types';
import { getFrostBrain } from '../../harness/brain';
import { FROST_PERSONA, NO_STAGE_DIRECTION, HUMAN_VOICE, cleanVoice } from '../../harness/persona';
import { formatHistory } from '../../harness/memory';

// Frost 这座电台能做的事（喂给大脑当自我认知，也用于 fallback 引导）
const CAPABILITIES = [
  '一键编排「24H 电台」：从现在到午夜沿日落线逐城择歌、写明理由',
  '按书/心情/场景给你策一份跨城歌单（比如"我在读卡夫卡"）',
  '切到某座城的电台、换歌、暂停（比如"播放圣彼得堡的歌"）',
  '讲讲某座城 / 某位歌手 / 某首歌背后的事',
  '跟着日落走：现在哪座城正临近黄昏',
];

const buildPrompt = (text: string, history: string) =>
  `你是${FROST_PERSONA.name}（${FROST_PERSONA.nameEn}），深夜电台的主理人。${FROST_PERSONA.selfIntro}\n` +
  `声音：冷静克制、带黄昏与远方的口吻，不像产品说明；对外永远是同一个你，不要暴露"子 agent / 系统 / 路由"这些词。\n` +
  `你这座电台能为用户做的事：\n${CAPABILITIES.map((c) => '· ' + c).join('\n')}\n` +
  (history ? history + '（结合上面的对话，别前后矛盾）\n' : '') +
  `用户问了一个没有现成功能直接对应的问题。请用一到三句话、用你的声音回应：` +
  `能答就答（世界、城市、音乐、夜晚、心情都能聊）；若他其实是想让你做点什么、而你能做的是上面那些，就自然把他引过去。` +
  `不要罗列功能清单，像深夜 DJ 那样说话。${NO_STAGE_DIRECTION}\n${HUMAN_VOICE}\n用户：${text}\n${FROST_PERSONA.name}：`;

const FALLBACKS = [
  '这事我先记在频率里了。眼下我能做的，是顺着日落给你排一整夜的歌，或者你说个城、说本书，我来挑。',
  '我在听。要不要我把电台调到某座正在天黑的城，或者按你此刻的心情排一段？',
  '夜还长，这个我们慢慢聊。你也可以让我切到某座城，或者一键排一整夜的 24H 电台。',
];
function pickFallback(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACKS[h % FALLBACKS.length];
}

export async function runGeneral(ctx: FrostContext): Promise<AgentResult<{ source: 'brain' | 'fallback' }>> {
  const text = (ctx.userText || '').trim();
  let reply = '';
  try { reply = cleanVoice((await getFrostBrain().complete(buildPrompt(text, formatHistory(ctx.history)))).trim()); } catch { reply = ''; }
  const source: 'brain' | 'fallback' = reply ? 'brain' : 'fallback';
  if (!reply) reply = pickFallback(text || 'frost');
  return {
    agent: 'general',
    reply,
    data: { source },
    radioActions: [],
    trace: [
      'Router → 通用兜底',
      `Input: ${text.slice(0, 24)}${text.length > 24 ? '…' : ''}`,
      source === 'brain' ? '大脑作答：Frost 声音回应，必要时引到可做的事' : '大脑不可用 → Frost 声音兜底',
    ],
  };
}
