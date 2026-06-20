// Pocket Earth · 生产服务（线上 demo）
// 单文件、零依赖（只用 Node 内置）：静态托管 dist/ + 把 dev 三中间件 1:1 搬到生产。
//   /api/frost-llm  云脑（通义 Qwen）代理，密钥服务端 .env 读，永不进前端 bundle
//   /api/edge       端侧推理（MNN sidecar / ollama / stub 三级降级），云上默认 stub
//   /api/unsplash   星球 agent 抓图代理，access key 服务端读
// 反代在前（nginx 443→本端口），本服务只监听内网端口。运行：node server.mjs（或 pm2）。
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')

// —— 极简 .env 加载（不覆盖已有 process.env，便于 pm2/系统环境优先） ——
;(function loadEnv() {
  const f = path.join(__dirname, '.env')
  if (!existsSync(f)) return
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const k = m[1]
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
})()

const PORT = Number(process.env.API_PORT || process.env.PORT || 3008)
// 云脑：通义 Qwen（DashScope · OpenAI 兼容）；无 key 时无云脑，各 agent 自动走规则兜底。
const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || ''
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-plus'
const DASHSCOPE_BASE = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
// 现役云脑：通义 Qwen（DashScope）；无 key 则 LLM=null。
const LLM = DASHSCOPE_KEY
  ? { name: 'qwen', key: DASHSCOPE_KEY, url: `${DASHSCOPE_BASE}/chat/completions`, model: QWEN_MODEL }
  : null
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || ''
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434'
const EDGE_MODEL = process.env.EDGE_MODEL || 'qwen3:0.6b'
const EDGE_VISION_MODEL = process.env.EDGE_VISION_MODEL || 'qwen2.5vl:3b'
const MNN_URL = process.env.MNN_URL || ''
const EDGE_WANT = (process.env.EDGE_BACKEND || 'stub').toLowerCase() // 云上默认 stub

// ——————————————————— 工具 ———————————————————
function sendJSON(res, obj, code = 200) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(body)
}
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))   // 整体解码，防多字节 UTF-8 在 chunk 边界被切碎（中文损坏）
  })
}

// ——————————————————— /api/frost-llm（通义 Qwen 云脑） ———————————————————
async function handleFrostLlm(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
  const raw = await readBody(req)
  try {
    if (!LLM) return sendJSON(res, { text: '', error: 'no_key' })
    const { prompt, system, json, search } = JSON.parse(raw || '{}')
    const messages = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })
    const r = await fetch(LLM.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${LLM.key}` },
      body: JSON.stringify({
        model: LLM.model,
        messages,
        temperature: json ? 0 : 0.7, // 结构化/路由类求确定性；对话类保留创造性
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        // 联网搜索：仅 Qwen(DashScope) 支持 enable_search，供「建图」研究流水线取真实数据。
        ...(search && LLM.name === 'qwen' ? { enable_search: true } : {}),
      }),
    })
    const data = await r.json()
    sendJSON(res, { text: data?.choices?.[0]?.message?.content || '' })
  } catch (e) {
    sendJSON(res, { text: '', error: String(e) })
  }
}

// ——————————————————— /api/frost-llm-stream（云脑 · 真 SSE token 流，additive 不改上面的非流式路由）———————————————————
// DashScope/Qwen OpenAI 兼容流式：上游 stream:true 吐 SSE，逐 token 透传给前端 data:{token}；收尾 data:{done:true}。
async function handleFrostLlmStream(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
  const raw = await readBody(req)
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' })
  const sse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
  try {
    if (!LLM) { sse({ done: true, error: 'no_key' }); res.end(); return }
    const { prompt, system } = JSON.parse(raw || '{}')
    const messages = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })
    const r = await fetch(LLM.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${LLM.key}` },
      body: JSON.stringify({ model: LLM.model, messages, temperature: 0.7, stream: true }),
    })
    if (!r.ok || !r.body) { sse({ done: true, error: 'http_' + r.status }); res.end(); return }
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''   // 末行可能不完整，留到下一块
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const payload = t.slice(5).trim()
        if (payload === '[DONE]') { sse({ done: true }); res.end(); return }
        try { const tok = JSON.parse(payload)?.choices?.[0]?.delta?.content; if (tok) sse({ token: tok }) } catch { /* 跳过非 JSON 行 */ }
      }
    }
    sse({ done: true }); res.end()
  } catch (e) {
    try { sse({ done: true, error: String(e) }); res.end() } catch { /* 连接已断 */ }
  }
}

// ——————————————————— /api/edge（端侧推理 + 三级降级） ———————————————————
const edgeCache = { ollama: null, ollamaAt: 0, mnn: null, mnnAt: 0 }
async function probeOllama() {
  const now = Date.now()
  if (edgeCache.ollama !== null && now - edgeCache.ollamaAt < 10000) return edgeCache.ollama
  try { edgeCache.ollama = (await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(1500) })).ok } catch { edgeCache.ollama = false }
  edgeCache.ollamaAt = now; return !!edgeCache.ollama
}
async function probeMnn() {
  if (!MNN_URL) return false
  const now = Date.now()
  if (edgeCache.mnn !== null && now - edgeCache.mnnAt < 10000) return edgeCache.mnn
  try { edgeCache.mnn = (await fetch(MNN_URL + '/health', { signal: AbortSignal.timeout(1500) })).ok } catch { edgeCache.mnn = false }
  edgeCache.mnnAt = now; return !!edgeCache.mnn
}
async function ollamaChat(messages, opts = {}) {
  const r = await fetch(OLLAMA + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: opts.model || EDGE_MODEL, messages, stream: false, think: opts.think ?? false, ...(opts.json ? { format: 'json' } : {}) }),
  })
  return (await r.json())?.message?.content || ''
}
async function ollamaEmbed(texts) {
  const out = []
  for (const t of texts) {
    try {
      const r = await fetch(OLLAMA + '/api/embeddings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: EDGE_MODEL, prompt: t }) })
      const d = await r.json(); out.push(Array.isArray(d?.embedding) ? d.embedding : [])
    } catch { out.push([]) }
  }
  return out
}
async function mnnChat(messages, opts = {}) {
  const system = messages.find((m) => m.role === 'system')?.content
  const prompt = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n')
  const images = messages.flatMap((m) => m.images || [])
  let sys = (system || '').trim()
  if (opts.json) sys = (sys + '\n只输出纯 JSON，不要 Markdown 代码块、不要 ``` 包裹。').trim()
  const r = await fetch(MNN_URL + '/v1/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system: sys, prompt, images: images.length ? images : undefined, json: !!opts.json, model: images.length ? 'vision' : 'text' }),
  })
  const d = await r.json()
  return typeof d?.text === 'string' ? d.text : ''
}
async function mnnEmbed(texts) { return texts.map(() => []) }
async function pickBackend() {
  if (EDGE_WANT === 'stub') return null
  if (EDGE_WANT === 'mnn') return (await probeMnn()) ? { name: 'mnn', chat: mnnChat, embed: mnnEmbed } : null
  if (EDGE_WANT === 'ollama') return (await probeOllama()) ? { name: 'ollama', chat: ollamaChat, embed: ollamaEmbed } : null
  if (await probeMnn()) return { name: 'mnn', chat: mnnChat, embed: mnnEmbed }
  if (await probeOllama()) return { name: 'ollama', chat: ollamaChat, embed: ollamaEmbed }
  return null
}
async function toBase64(image) {
  if (image.startsWith('data:')) return image.split(',')[1] || ''
  if (image.startsWith('http')) return Buffer.from(await (await fetch(image)).arrayBuffer()).toString('base64')
  return image
}
function edgeStub(b) {
  switch (b?.task) {
    case 'rank': { const n = (b.candidates || []).length; return { backend: 'stub', scores: (b.candidates || []).map((_, i) => (n > 1 ? 1 - i / (n - 1) : 1)) } }
    case 'embed': return { backend: 'stub', vectors: (b.texts || []).map(() => []) }
    case 'classify': return { backend: 'stub', text: (b.labels || [])[0] || '' }
    default: return { backend: 'stub', text: '' }
  }
}
async function edgeHandle(raw) {
  const b = JSON.parse(raw || '{}')
  const be = await pickBackend()
  if (!be) return edgeStub(b)
  switch (b.task) {
    case 'ping': return { backend: be.name }
    case 'chat': {
      const msgs = []
      if (b.system) msgs.push({ role: 'system', content: b.system })
      msgs.push({ role: 'user', content: b.prompt })
      return { backend: be.name, text: await be.chat(msgs, { json: b.json }) }
    }
    case 'classify': {
      const t = await be.chat([
        { role: 'system', content: '你是分类器。只输出给定选项中的一个，不要任何多余文字。' },
        { role: 'user', content: `文本：${b.text}\n选项：${(b.labels || []).join(' / ')}\n答：` },
      ], { think: false })
      const pick = (b.labels || []).find((l) => t.includes(l)) || (b.labels || [])[0] || ''
      return { backend: be.name, text: pick }
    }
    case 'rank': {
      const t = await be.chat([
        { role: 'system', content: '给每个候选打 0-100 的相关度分。只返回一个 JSON 数组（仅数字，长度与候选一致）。' },
        { role: 'user', content: `查询：${b.query}\n候选：\n${(b.candidates || []).map((c, i) => `${i}. ${c}`).join('\n')}\nJSON：` },
      ], { json: true, think: false })
      let scores
      try { const arr = JSON.parse(t); const list = Array.isArray(arr) ? arr : arr.scores || []; scores = (b.candidates || []).map((_, i) => (Number(list[i]) || 0) / 100) }
      catch { scores = (b.candidates || []).map(() => 0.5) }
      return { backend: be.name, scores }
    }
    case 'embed': return { backend: be.name, vectors: await be.embed(b.texts || []) }
    case 'vision': {
      const b64 = await toBase64(b.image)
      const text = await be.chat([{ role: 'user', content: b.prompt, images: [b64] }], { model: EDGE_VISION_MODEL, think: false })
      return { backend: be.name, text }
    }
    default: return edgeStub(b)
  }
}
async function handleEdge(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
  const raw = await readBody(req)
  try { sendJSON(res, await edgeHandle(raw)) } catch (e) { sendJSON(res, { backend: 'stub', error: String(e) }) }
}

// ——————————————————— /api/unsplash（星球 agent 抓图） ———————————————————
async function handleUnsplash(req, res, url) {
  try {
    if (!UNSPLASH_KEY) return sendJSON(res, { photos: [], error: 'no_key' })
    const track = url.searchParams.get('track')
    if (track) {
      try { const t = new URL(track); t.searchParams.set('client_id', UNSPLASH_KEY); await fetch(t.toString()) } catch { /* 合规埋点静默 */ }
      return sendJSON(res, { ok: true })
    }
    const query = (url.searchParams.get('query') || '').trim()
    const count = Math.min(30, Math.max(1, Number(url.searchParams.get('count') || 24)))
    if (!query) return sendJSON(res, { photos: [], error: 'no_query' })
    const api = new URL('https://api.unsplash.com/search/photos')
    api.searchParams.set('query', query)
    api.searchParams.set('per_page', String(count))
    api.searchParams.set('orientation', 'landscape')
    api.searchParams.set('content_filter', 'high')
    const r = await fetch(api.toString(), { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}`, 'Accept-Version': 'v1' } })
    if (!r.ok) return sendJSON(res, { photos: [], error: `unsplash_${r.status}` })
    const data = await r.json()
    const photos = (data?.results || []).map((p) => {
      const urls = p.urls || {}, user = p.user || {}, links = p.links || {}, userLinks = user.links || {}
      return {
        id: String(p.id || ''), thumb: urls.small || urls.thumb || '', full: urls.regular || urls.full || urls.small || '',
        alt: String(p.alt_description || p.description || ''), author: String(user.name || ''), authorUrl: userLinks.html || '',
        link: links.html || '', color: String(p.color || '#888'), downloadLocation: links.download_location || '',
      }
    }).filter((p) => p.thumb)
    sendJSON(res, { photos, total: data?.total || photos.length })
  } catch (e) {
    sendJSON(res, { photos: [], error: String(e) })
  }
}

// ——————————————————— /api/travel-mcp（只读旅行数据：OSM 地理编码/POI + Open-Meteo 天气） ———————————————————
// 红线：只挂【只读查询】工具（geocode / poi / weather），无 book/pay/任何下单端点。
// 经本服务代理（守 OSM/Open-Meteo 使用政策的 User-Agent + 超时），前端绝不直连。任何失败让前端走本地兜底。
const UA_TRAVEL = { 'User-Agent': 'PocketEarth/1.0 (personal travel agent)' }
async function handleTravelMcp(req, res, url) {
  const tool = url.searchParams.get('tool') || ''
  try {
    if (tool === 'geocode') {
      const q = (url.searchParams.get('q') || '').trim()
      if (!q) return sendJSON(res, { error: 'no_query' })
      const api = new URL('https://nominatim.openstreetmap.org/search')
      api.searchParams.set('q', q); api.searchParams.set('format', 'json'); api.searchParams.set('limit', '1'); api.searchParams.set('accept-language', 'zh')
      const r = await fetch(api.toString(), { headers: UA_TRAVEL, signal: AbortSignal.timeout(6000) })
      const d = await r.json()
      const hit = Array.isArray(d) && d[0]
      return sendJSON(res, hit ? { lng: Number(hit.lon), lat: Number(hit.lat), name: String(hit.display_name || q).split(',')[0] } : { error: 'not_found' })
    }
    if (tool === 'poi') {
      const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'))
      const radius = Math.min(5000, Math.max(200, Number(url.searchParams.get('radius') || 1500)))
      const kind = url.searchParams.get('kind') || 'tourism'
      if (!isFinite(lat) || !isFinite(lng)) return sendJSON(res, { error: 'no_coord' })
      const filter = kind === 'restaurant' ? 'node["amenity"="restaurant"]'
        : kind === 'cafe' ? 'node["amenity"="cafe"]'
        : 'node["tourism"~"attraction|museum|viewpoint|artwork|gallery"]'
      const ql = `[out:json][timeout:8];(${filter}(around:${radius},${lat},${lng}););out body 20;`
      const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { ...UA_TRAVEL, 'content-type': 'text/plain' }, body: ql, signal: AbortSignal.timeout(9000) })
      const d = await r.json()
      const pois = (d?.elements || []).filter((e) => e.tags && e.tags.name).slice(0, 12).map((e) => ({ name: e.tags.name, lat: e.lat, lng: e.lon, kind: e.tags.tourism || e.tags.amenity || '' }))
      return sendJSON(res, { pois })
    }
    if (tool === 'weather') {
      const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'))
      if (!isFinite(lat) || !isFinite(lng)) return sendJSON(res, { error: 'no_coord' })
      const api = new URL('https://api.open-meteo.com/v1/forecast')
      api.searchParams.set('latitude', String(lat)); api.searchParams.set('longitude', String(lng))
      api.searchParams.set('current', 'temperature_2m,weather_code'); api.searchParams.set('timezone', 'auto')
      const r = await fetch(api.toString(), { signal: AbortSignal.timeout(6000) })
      const d = await r.json()
      const c = d?.current || {}
      return sendJSON(res, { temp: c.temperature_2m, code: c.weather_code })
    }
    return sendJSON(res, { error: 'unknown_tool' })
  } catch (e) {
    return sendJSON(res, { error: String(e) })
  }
}

// ——————————————————— 静态托管（dist/ + SPA 回退） ———————————————————
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
}
// —— 文本类资源按需压缩（br 优先，否则 gzip）；压缩结果按 路径+编码+mtime 缓存，避免每次重压 ——
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.map', '.txt'])
const compCache = new Map()
function compressFor(accept, buf, abs, mtimeMs) {
  let enc = ''
  if (/\bbr\b/.test(accept)) enc = 'br'
  else if (/\bgzip\b/.test(accept)) enc = 'gzip'
  if (!enc || buf.length < 1024) return { enc: '', body: buf } // 小文件不值得压
  const key = `${abs}:${enc}:${mtimeMs}`
  let body = compCache.get(key)
  if (!body) {
    body = enc === 'br'
      ? brotliCompressSync(buf, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } })
      : gzipSync(buf, { level: 6 })
    compCache.set(key, body)
  }
  return { enc, body }
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '')
  if (rel === '') rel = 'index.html'
  let abs = path.join(DIST, rel)
  if (!abs.startsWith(DIST)) { res.writeHead(403); res.end('forbidden'); return } // 防目录穿越
  let st = null
  try { st = await stat(abs); if (!st.isFile()) st = null } catch { st = null }
  if (!st) { abs = path.join(DIST, 'index.html'); rel = 'index.html'; try { st = await stat(abs) } catch { /* noop */ } } // SPA 回退
  try {
    const buf = await readFile(abs)
    const ext = path.extname(abs).toLowerCase()
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream' }
    // 带哈希的资源长缓存；index.html / sw.js / manifest 不缓存（始终拿最新，PWA 更新即时生效）
    if (rel === 'index.html' || rel === 'sw.js' || rel === 'manifest.webmanifest') headers['cache-control'] = 'no-cache'
    else if (rel.startsWith('assets/')) headers['cache-control'] = 'public, max-age=31536000, immutable'
    else if (rel.startsWith('icons/') || rel.startsWith('splash/') || rel === 'favicon.ico') headers['cache-control'] = 'public, max-age=604800'
    // 文本资源按需压缩（js/css/json/html… 体积大头），图片字体已是压缩格式不重复压
    if (COMPRESSIBLE.has(ext)) {
      headers['vary'] = 'Accept-Encoding'
      const { enc, body } = compressFor(req.headers['accept-encoding'] || '', buf, abs, st ? st.mtimeMs : 0)
      if (enc) { headers['content-encoding'] = enc; res.writeHead(200, headers); res.end(body); return }
    }
    res.writeHead(200, headers)
    res.end(buf)
  } catch {
    res.writeHead(404); res.end('not found')
  }
}

// ——————————————————— 主服务 ———————————————————
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const p = url.pathname
  try {
    if (p === '/api/frost-llm') return await handleFrostLlm(req, res)
    if (p === '/api/frost-llm-stream') return await handleFrostLlmStream(req, res)
    if (p === '/api/edge') return await handleEdge(req, res)
    if (p === '/api/unsplash') return await handleUnsplash(req, res, url)
    if (p === '/api/travel-mcp') return await handleTravelMcp(req, res, url)
    if (p === '/healthz') return sendJSON(res, { ok: true, edge: EDGE_WANT, llm: LLM ? LLM.name : 'off', model: LLM ? LLM.model : '', travelMcp: 'osm+openmeteo' })
    return await serveStatic(req, res, p)
  } catch (e) {
    res.writeHead(500); res.end('server error')
  }
})
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[pocket-earth] 监听 :${PORT}  llm=${LLM ? LLM.name + '/' + LLM.model : 'off'}  edge=${EDGE_WANT}  unsplash=${UNSPLASH_KEY ? 'on' : 'off'}`)
})
