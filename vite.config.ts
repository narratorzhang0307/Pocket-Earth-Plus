import { defineConfig, loadEnv, type Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { frostEdge } from './frost-agent/edge/viteEdge'
import { unsplashProxy } from './frost-agent/planet/viteUnsplash'
import { buildProviderRequest } from './frost-agent/provider-compat'

// LLM 代理：dev 中间件，把 /api/frost-llm 转给云脑。
// 云脑只用通义 Qwen（DashScope）。
// 请求体由 provider-compat 单入口拼（换/加模型只改那层）；密钥只在服务端（从 .env 读），
// 永不进前端 bundle；无 key / 出错时返回空串，各子 agent 自动回退到规则 fallback。
function frostLlm(env: Record<string, string>): Plugin {
  const KEY = env.DASHSCOPE_API_KEY || env.QWEN_API_KEY || ''
  const provider = 'dashscope'
  const MODEL = env.QWEN_MODEL || 'qwen-plus'
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
            const { prompt, system, json, search } = JSON.parse(body || '{}')
            const messages: { role: string; content: string }[] = []
            if (system) messages.push({ role: 'system', content: system })
            messages.push({ role: 'user', content: prompt })
            const pr = buildProviderRequest(provider, { messages, json, model: MODEL, search: !!search }, KEY)
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
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          // 把大依赖拆成独立 chunk：mapbox 只随地球 tab 加载、可独立缓存；
          // react/motion 各自成块；其余三方进 vendor。配合 tab 懒加载，首屏 JS 大幅瘦身。
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return
            // 端侧大脑：web-llm 只在用户点「启用端侧」时动态 import；单独切块保持懒加载，
            // 否则会被 vendor 兜底吞进首屏急加载块（5.7MB），违背按需下载。
            if (id.includes('@mlc-ai') || id.includes('web-llm')) return 'webllm'
            if (id.includes('mapbox-gl')) return 'mapbox'
            if (id.includes('/react') || id.includes('react-dom') || id.includes('scheduler')) return 'react'
            if (id.includes('motion') || id.includes('framer')) return 'motion'
            return 'vendor'
          },
        },
      },
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
