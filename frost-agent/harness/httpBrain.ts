// 真实大脑：把提示 POST 给 /api/frost-llm（Vite 中间件代理 DeepSeek）。
// 返回空串（无 key / 出错 / 非 dev）时，各子 agent 自动回退到规则 fallback。
import { FrostBrain } from './types';

export const httpBrain: FrostBrain = {
  async complete(prompt: string, opts?: { json?: boolean; search?: boolean }): Promise<string> {
    try {
      const r = await fetch('/api/frost-llm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, json: !!opts?.json, search: !!opts?.search }),
      });
      if (!r.ok) return '';
      const data = await r.json();
      return typeof data?.text === 'string' ? data.text : '';
    } catch {
      return '';
    }
  },
};
