// Provider 适配器 · DeepSeek（OpenAI 兼容 chat/completions）
// 删除条件：当项目不再用 DeepSeek 作云脑时，删本文件 + index.ts 里对应的 register 行即可。
import type { ProviderAdapter } from './index';

export const deepseekAdapter: ProviderAdapter = {
  name: 'deepseek',
  matches: (p) => p === 'deepseek' || p.startsWith('deepseek'),
  apply: (req, key) => ({
    url: 'https://api.deepseek.com/v1/chat/completions',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: {
      model: 'deepseek-chat',
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    },
  }),
};
