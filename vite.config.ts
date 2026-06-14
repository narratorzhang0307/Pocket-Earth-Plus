import { defineConfig, loadEnv, type Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { frostEdge } from './frost-agent/edge/viteEdge'
import { unsplashProxy } from './frost-agent/planet/viteUnsplash'
import { buildProviderRequest } from './frost-agent/provider-compat'

// LLM 代理：dev 中间件，把 /api/frost-llm 转给云脑（默认 DeepSeek）。
// 请求体由 provider-compat 单入口拼（换/加模型只改那层）；密钥只在服务端（从 .env 读），
// 永不进前端 bundle；无 key / 出错时返回空串，各子 agent 自动回退到规则 fallback。
function frostLlm(env: Record<string, string>): Plugin {
  const KEY = env.DEEPSEEK_API_KEY || ''
  return {
    name: 'frost-llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/frost-llm', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', async () => {
          const send = (obj: unknown) => {
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(obj))
          }
          try {
            if (!KEY) return send({ text: '', error: 'no_key' })
            const { prompt, system, json } = JSON.parse(body || '{}')
            const messages: { role: string; content: string }[] = []
            if (system) messages.push({ role: 'system', content: system })
            messages.push({ role: 'user', content: prompt })
            const pr = buildProviderRequest('deepseek', { messages, json }, KEY)
            const r = await fetch(pr.url, { method: 'POST', headers: pr.headers, body: JSON.stringify(pr.body) })
            const data = await r.json()
            send({ text: data?.choices?.[0]?.message?.content || '' })
          } catch (e) {
            send({ text: '', error: String(e) })
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
    },
    plugins: [react(), tailwindcss(), frostLlm(env), frostEdge(env), unsplashProxy(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'frost-agent': path.resolve(__dirname, './frost-agent'),
      },
    },
  }
})
