// Provider 适配器 · 通义 Qwen（阿里云百炼 DashScope · OpenAI 兼容 chat/completions）
// 云脑换成 Qwen 只加这一个文件 + index.ts 里 register 一行。
// 模型由 req.model 传入（中间件读 env QWEN_MODEL，默认 qwen-plus）；接入点默认国内节点。
// 海外/新加坡节点：把 BASE 换成 https://dashscope-intl.aliyuncs.com/compatible-mode/v1 即可。
import type { ProviderAdapter } from './index';

const BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export const dashscopeAdapter: ProviderAdapter = {
  name: 'dashscope',
  // 'dashscope' / 'qwen' / 'qwen3.6-plus' … 都路由到这里
  matches: (p) => p === 'dashscope' || p === 'qwen' || p.startsWith('qwen') || p.startsWith('dashscope'),
  apply: (req, key) => {
    // utility mode：结构化 / 路由类(json)求确定性 → temperature 0；对话类保留创造性。
    const utility = !!req.json;
    return {
      url: `${BASE}/chat/completions`,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: {
        model: req.model || 'qwen-plus',
        messages: req.messages,
        temperature: req.temperature ?? (utility ? 0 : 0.7),
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      },
    };
  },
};
