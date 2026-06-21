// 端侧模型 · 前端客户端
// 把请求 POST 给 /api/edge（dev 中间件 / 生产服务），由服务端路由到 ollama / MNN / stub。
// 任何一步失败都安全降级：available 返回 false、其余返回空值，调用方走规则兜底。
import type { EdgeModel, EdgeRequest, EdgeResponse } from './types';

async function call(body: EdgeRequest): Promise<EdgeResponse> {
  // /api/edge 的 fetch 无原生超时：服务端 VL / LLM 推理挂起时 await 会永久 pending（曾致记一笔截图认片卡死 176s）。
  // 按 task 分档超时（vision 走端侧 3B VL 最重、冷加载/大图给足余量；chat 次之；其余文本小模型短超时），超时 abort → 落 catch → stub 兜底（等价端侧不可用，上层走规则/手填）。
  const timeoutMs = body.task === 'vision' ? 35000 : body.task === 'chat' ? 20000 : 15000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('/api/edge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) return { backend: 'stub' };
    return (await r.json()) as EdgeResponse;
  } catch {
    return { backend: 'stub' };
  } finally {
    clearTimeout(timer);
  }
}

export const httpEdge: EdgeModel = {
  async available() {
    const r = await call({ task: 'ping' });
    return r.backend !== 'stub';
  },
  async chat(prompt, opts) {
    const r = await call({ task: 'chat', prompt, system: opts?.system, json: opts?.json });
    return typeof r.text === 'string' ? r.text : '';
  },
  async classify(text, labels) {
    const r = await call({ task: 'classify', text, labels });
    return typeof r.text === 'string' && r.text ? r.text : '';
  },
  async rank(query, candidates) {
    const r = await call({ task: 'rank', query, candidates });
    return Array.isArray(r.scores) && r.scores.length === candidates.length ? r.scores : [];
  },
  async embed(texts) {
    const r = await call({ task: 'embed', texts });
    return Array.isArray(r.vectors) ? r.vectors : [];
  },
  async vision(image, prompt) {
    const r = await call({ task: 'vision', image, prompt });
    return typeof r.text === 'string' ? r.text : '';
  },
};
