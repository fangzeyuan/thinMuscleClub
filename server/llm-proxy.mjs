// OpenAI 兼容的 Chat Completions 代理：API Key 只保存在服务端，不暴露给浏览器。
// 支持 OpenAI / 通义千问(DashScope 兼容模式) / DeepSeek / Kimi 等。

const PROVIDERS = [
  ['dashscope', '通义千问'],
  ['openai.com', 'OpenAI'],
  ['deepseek', 'DeepSeek'],
  ['moonshot', 'Kimi'],
  ['bigmodel', '智谱'],
]

export function llmConfig(env = process.env) {
  const baseUrl = (env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '')
  const provider = PROVIDERS.find(([k]) => baseUrl.includes(k))?.[1] ?? '自定义'
  return { baseUrl, apiKey: env.LLM_API_KEY || '', model: env.LLM_MODEL || 'qwen-plus', provider }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > 1_000_000) reject(new Error('请求体过大'))
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const send = (res, status, obj) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

/** 处理 /api/*，返回 true 表示已处理 */
export async function handleApi(req, res, cfg) {
  const url = (req.url || '').split('?')[0]
  if (url === '/api/health') {
    send(res, 200, { configured: Boolean(cfg.apiKey), model: cfg.model, provider: cfg.provider })
    return true
  }
  if (url !== '/api/chat') return false
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' }), true
  if (!cfg.apiKey) return send(res, 503, { error: '服务端未配置 LLM_API_KEY，请参考 .env.example' }), true

  try {
    const { messages, tools } = JSON.parse(await readBody(req))
    if (!Array.isArray(messages)) return send(res, 400, { error: 'messages 缺失' }), true
    const upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, tools, temperature: 0.6 }),
      signal: AbortSignal.timeout(60_000),
    })
    const text = await upstream.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text.slice(0, 300) }
    }
    if (!upstream.ok) {
      const message = data?.error?.message || data?.message || data?.error || `上游错误 ${upstream.status}`
      return send(res, upstream.status, { error: message }), true
    }
    send(res, 200, data)
  } catch (e) {
    send(res, 502, { error: e?.name === 'TimeoutError' ? '模型响应超时' : String(e?.message || e) })
  }
  return true
}
