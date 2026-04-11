// ── Vercel Serverless AI Proxy ─────────────────────────────────────────────
// All Anthropic calls are routed through here so the API key never reaches
// the browser. Supports 6 named actions matching anthropicService.js.
//
// POST /api/ai
// Body: { action, payload }
// Response: { text } | { error }

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'
const TIMEOUT_MS = 28000 // stay under Vercel's 30s function limit
const REQUEST_ID_HEADER = 'X-Request-Id'
const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'

const ERRORS = {
  BAD_METHOD: 'BAD_METHOD',
  RATE_LIMITED: 'RATE_LIMITED',
  BAD_JSON: 'BAD_JSON',
  BAD_BODY: 'BAD_BODY',
  BAD_PAYLOAD: 'BAD_PAYLOAD',
  AI_MISSING_KEY: 'AI_MISSING_KEY',
  AI_API_KEY_INVALID: 'AI_API_KEY_INVALID',
  AI_MODEL_NOT_FOUND: 'AI_MODEL_NOT_FOUND',
  AI_PROVIDER_RATE_LIMIT: 'AI_PROVIDER_RATE_LIMIT',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
}

function makeRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getClientRequestId(req) {
  const raw = req.headers?.[CLIENT_REQUEST_ID_HEADER]
  if (Array.isArray(raw)) return String(raw[0] || '').slice(0, 80)
  if (typeof raw === 'string') return raw.slice(0, 80)
  return ''
}

function makeError(message, code, status) {
  const err = new Error(message)
  err.code = code
  err.status = status
  return err
}

function logEvent(event, fields) {
  console.log(JSON.stringify({ event, ...fields }))
}

function respondError(res, { status, error, code, requestId }) {
  return res.status(status).json({ error, code, requestId })
}

// ── Simple in-memory rate limiter ────────────────────────────────────────
// Allows MAX_REQUESTS per IP within WINDOW_MS. Resets per cold start, which
// is acceptable given Vercel's function lifecycle.
const WINDOW_MS = 60_000
const MAX_REQUESTS = 20
const requestLog = new Map()

function isRateLimited(ip) {
  const now = Date.now()
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < WINDOW_MS)
  if (timestamps.length >= MAX_REQUESTS) return true
  timestamps.push(now)
  requestLog.set(ip, timestamps)
  return false
}

// ── Input validation ──────────────────────────────────────────────────────
const ALLOWED_ACTIONS = new Set([
  'copilot',
  'parseDestination',
  'interpretSketch',
  'refinePOI',
  'tripSummary',
  'routeSuggestions',
])

function validateBody(body) {
  if (!body || typeof body !== 'object') return 'Request body is required.'
  if (!body.action) return 'Missing required field: action.'
  if (!ALLOWED_ACTIONS.has(body.action)) return `Unknown action: ${body.action}.`
  if (!body.payload || typeof body.payload !== 'object') return 'Missing required field: payload.'
  return null
}

// ── Prompt builders ───────────────────────────────────────────────────────
function buildCopilotRequest(payload) {
  const { history = [], userMessage, context = {} } = payload
  const { userLocation, destination, routeSteps = [], currentStepIndex = 0 } = context

  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0)
    throw new Error('copilot: userMessage is required.')
  if (userMessage.length > 1000)
    throw new Error('copilot: userMessage exceeds 1000 characters.')

  const system = `You are 3D Streets AI — a calm, expert navigation co-pilot embedded in a premium GPS app.
You have access to:
- User's current location: ${userLocation ? `${Number(userLocation.lat).toFixed(4)}, ${Number(userLocation.lng).toFixed(4)}` : 'unknown'}
- Active destination: ${destination?.name ?? 'none'}
- Current step: ${routeSteps[currentStepIndex]?.instruction ?? 'not navigating'}

You help with:
- Finding places ("find a Chipotle before my next stop")
- Route questions ("how long until I hit traffic?")
- Destination changes ("actually let's go to the beach first")
- General navigation advice

Respond conversationally. Keep answers under 3 sentences unless listing options.
When suggesting a destination, end your response with: DESTINATION::PlaceName, City, State
When suggesting a waypoint stop, end with: WAYPOINT::PlaceName, City, State
Never make up or hallucinate places — only suggest real, well-known locations.`

  const safeHistory = (Array.isArray(history) ? history.slice(-8) : [])
    .filter(m => m.role && m.content)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }))

  return {
    system,
    messages: [...safeHistory, { role: 'user', content: userMessage.trim() }],
    maxTokens: 400,
  }
}

function buildParseDestinationRequest(payload) {
  const { query, userLocation } = payload
  if (!query || typeof query !== 'string') throw new Error('parseDestination: query is required.')
  const locStr = userLocation?.lat != null
    ? `${Number(userLocation.lat).toFixed(3)},${Number(userLocation.lng).toFixed(3)}`
    : 'unknown'

  return {
    system: `Extract a navigation destination from user input. Return JSON only, no markdown.
Format: {"name":"place name","address":"full address or city state","type":"address|poi|relative","confidence":0.0-1.0}
If unclear or no real place: {"name":null}`,
    messages: [{ role: 'user', content: `User at ${locStr} said: "${query.slice(0, 500)}"` }],
    maxTokens: 150,
  }
}

function buildInterpretSketchRequest(payload) {
  const { startCoord, endCoord, pointCount, corridorMiles } = payload
  if (!startCoord || !endCoord) throw new Error('interpretSketch: startCoord and endCoord are required.')
  return {
    system: 'You are a navigation AI. Describe a drawn route in 1 short sentence. Be specific about road types (highway, coastal, backroad, downtown, etc). Confident tone. No quotes.',
    messages: [{
      role: 'user',
      content: `Drawn route: start ${Number(startCoord.lat).toFixed(3)},${Number(startCoord.lng).toFixed(3)} → end ${Number(endCoord.lat).toFixed(3)},${Number(endCoord.lng).toFixed(3)}. Points drawn: ${pointCount}. Corridor: ~${Number(corridorMiles).toFixed(1)} miles wide.`,
    }],
    maxTokens: 80,
  }
}

function buildRefinePOIRequest(payload) {
  const { userQuery, context = {} } = payload
  if (!userQuery || typeof userQuery !== 'string') throw new Error('refinePOI: userQuery is required.')
  return {
    system: `Parse a POI search query for a navigation app. Return JSON only.
Format: {"category":"gas|food|coffee|parking|charging|hotel|hospital","searchQuery":"mapbox search string","preferAlongRoute":bool,"maxDetourMiles":number}`,
    messages: [{ role: 'user', content: `Query: "${userQuery.slice(0, 300)}". Context: ${JSON.stringify(context).slice(0, 500)}` }],
    maxTokens: 120,
  }
}

function buildTripSummaryRequest(payload) {
  const { distance, duration, destination } = payload
  if (!destination) throw new Error('tripSummary: destination is required.')
  return {
    system: 'Generate a one-line friendly trip opener for a GPS app co-pilot. Under 10 words. Warm, like a smart travel companion. No quotes.',
    messages: [{ role: 'user', content: `${distance} to ${destination}, ~${duration}` }],
    maxTokens: 40,
  }
}

function buildRouteSuggestionsRequest(payload) {
  const { origin = {}, destination, preferences = [] } = payload
  if (!destination) throw new Error('routeSuggestions: destination is required.')
  return {
    system: `You are a routing expert. Given a trip, suggest 2-3 interesting routing options in JSON array.
Format: [{"label":"Option name","description":"1 sentence why","type":"fastest|scenic|avoid_highways|avoid_tolls"}]`,
    messages: [{
      role: 'user',
      content: `From: ${origin.name ?? 'current location'}. To: ${destination}. Prefs: ${preferences.join(', ')}`,
    }],
    maxTokens: 300,
  }
}

const ACTION_BUILDERS = {
  copilot: buildCopilotRequest,
  parseDestination: buildParseDestinationRequest,
  interpretSketch: buildInterpretSketchRequest,
  refinePOI: buildRefinePOIRequest,
  tripSummary: buildTripSummaryRequest,
  routeSuggestions: buildRouteSuggestionsRequest,
}

// ── Core Anthropic caller ─────────────────────────────────────────────────
async function callAnthropic({ system, messages, maxTokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw makeError('ANTHROPIC_API_KEY is not set in environment variables.', ERRORS.AI_MISSING_KEY, 502)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: [{ type: 'text', text: m.content }],
        })),
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      let message = errText
      try { message = JSON.parse(errText)?.error?.message || errText } catch { /* use raw */ }

      if (res.status === 401 || res.status === 403) {
        throw makeError('Anthropic API key rejected (401/403).', ERRORS.AI_API_KEY_INVALID, 502)
      }
      if (res.status === 404) {
        throw makeError(`Anthropic model not found: ${MODEL}.`, ERRORS.AI_MODEL_NOT_FOUND, 502)
      }
      if (res.status === 429) {
        throw makeError('Anthropic rate limit reached. Please try again shortly.', ERRORS.AI_PROVIDER_RATE_LIMIT, 429)
      }
      throw makeError(`Anthropic error ${res.status}: ${message}`, ERRORS.AI_PROVIDER_ERROR, 502)
    }

    const data = await res.json()
    const block = data.content?.find(b => b.type === 'text')
    return block?.text ?? null
  } finally {
    clearTimeout(timeout)
  }
}

// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const startedAt = Date.now()
  const requestId = getClientRequestId(req) || makeRequestId()
  res.setHeader(REQUEST_ID_HEADER, requestId)

  // CORS — allow same-origin and deployed Vercel URLs
  const origin = req.headers.origin || ''
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  const isAllowed = allowedOrigins.length === 0 || allowedOrigins.includes(origin) || origin === ''
  if (isAllowed) res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') {
    return respondError(res, {
      status: 405,
      error: 'Method not allowed. Use POST.',
      code: ERRORS.BAD_METHOD,
      requestId,
    })
  }

  // Rate limiting
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  if (isRateLimited(ip)) {
    logEvent('ai_request_rejected', {
      requestId,
      action: 'unknown',
      code: ERRORS.RATE_LIMITED,
      status: 429,
      durationMs: Date.now() - startedAt,
    })
    return respondError(res, {
      status: 429,
      error: 'Too many requests. Please slow down.',
      code: ERRORS.RATE_LIMITED,
      requestId,
    })
  }

  // Parse body
  let body
  try { body = typeof req.body === 'object' ? req.body : JSON.parse(req.body) }
  catch {
    return respondError(res, {
      status: 400,
      error: 'Invalid JSON body.',
      code: ERRORS.BAD_JSON,
      requestId,
    })
  }

  // Validate
  const validationError = validateBody(body)
  if (validationError) {
    return respondError(res, {
      status: 400,
      error: validationError,
      code: ERRORS.BAD_BODY,
      requestId,
    })
  }

  // Build prompt
  let claudeRequest
  try {
    claudeRequest = ACTION_BUILDERS[body.action](body.payload)
  } catch (err) {
    return respondError(res, {
      status: 400,
      error: err.message,
      code: ERRORS.BAD_PAYLOAD,
      requestId,
    })
  }

  // Call Anthropic
  try {
    const text = await callAnthropic(claudeRequest)
    logEvent('ai_request_success', {
      requestId,
      action: body.action,
      status: 200,
      durationMs: Date.now() - startedAt,
    })
    return res.status(200).json({ text })
  } catch (err) {
    const isAbort = err?.name === 'AbortError'
    const code = isAbort ? ERRORS.AI_TIMEOUT : (err.code || ERRORS.AI_PROVIDER_ERROR)
    const status = isAbort ? 504 : (err.status || 502)
    const message = isAbort ? 'AI request timed out. Please try again.' : (err.message || 'AI request failed.')

    logEvent('ai_request_failed', {
      requestId,
      action: body.action,
      status,
      code,
      durationMs: Date.now() - startedAt,
      message,
    })

    return respondError(res, {
      status,
      error: message,
      code,
      requestId,
    })
  }
}
