// ── Anthropic Claude Service ──────────────────────────────────────────────
// All AI calls are proxied through /api/ai (Vercel serverless function)
// so the Anthropic API key is never exposed in the browser bundle.
//
// Action map:
//  copilot           → navigation co-pilot chat
//  parseDestination  → natural language destination extraction
//  interpretSketch   → sketch-a-route description
//  refinePOI         → POI query refinement
//  tripSummary       → friendly trip opener line
//  routeSuggestions  → 2-3 route option suggestions

const PROXY_URL = '/api/ai'

let lastClaudeError = ''
let lastClaudeMeta = {
  action: '',
  status: 0,
  code: '',
  requestId: '',
}

export function getLastClaudeError() {
  return lastClaudeError
}

export function getLastClaudeMeta() {
  return lastClaudeMeta
}

function makeClientRequestId(action) {
  return `${action}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function mapErrorMessage({ status, code, fallback }) {
  if (code === 'AI_TIMEOUT') return 'The AI request timed out. Please retry.'
  if (code === 'AI_API_KEY_INVALID') return 'AI service credentials were rejected by the provider.'
  if (code === 'AI_MODEL_NOT_FOUND') return 'Configured AI model was not found. Check ANTHROPIC_MODEL.'
  if (code === 'AI_PROVIDER_RATE_LIMIT' || status === 429) return 'AI provider is rate-limiting requests. Please wait and retry.'
  if (code === 'RATE_LIMITED') return 'Too many AI requests from this app instance. Please slow down briefly.'
  if (code === 'AI_MISSING_KEY') return 'Server AI key is missing. Configure ANTHROPIC_API_KEY.'
  return fallback || `Server error (${status}). Check server logs.`
}

// Core proxy wrapper — POSTs {action, payload} to the serverless function
async function callProxy(action, payload, timeoutMs = 29000) {
  lastClaudeError = ''
  lastClaudeMeta = { action, status: 0, code: '', requestId: '' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const clientRequestId = makeClientRequestId(action)

  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-client-request-id': clientRequestId,
      },
      body: JSON.stringify({ action, payload }),
    })

    const data = await res.json().catch(() => ({}))
    const requestId = res.headers.get('x-request-id') || data.requestId || clientRequestId
    lastClaudeMeta = {
      action,
      status: res.status,
      code: data.code || '',
      requestId,
    }

    if (!res.ok) {
      lastClaudeError = mapErrorMessage({
        status: res.status,
        code: data.code,
        fallback: data.error,
      })
      console.error('[anthropicService]', {
        action,
        status: res.status,
        code: data.code,
        requestId,
        error: lastClaudeError,
      })
      return null
    }

    return data.text ?? null
  } catch (err) {
    lastClaudeMeta = {
      action,
      status: 0,
      code: err?.name === 'AbortError' ? 'AI_TIMEOUT' : 'NETWORK_ERROR',
      requestId: clientRequestId,
    }

    if (err?.name === 'AbortError') {
      lastClaudeError = 'AI request timed out. Please try again.'
    } else {
      lastClaudeError = `Network error reaching AI server: ${err?.message || 'unknown'}`
    }
    console.error('[anthropicService]', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── 1. Navigation Co-pilot ────────────────────────────────────────────────
export async function sendCopilotMessage({ history, userMessage, context }) {
  return callProxy('copilot', { history, userMessage, context })
}

// ── 2. Parse Destination from Natural Language ────────────────────────────
export async function parseDestination(query, userLocation) {
  const text = await callProxy('parseDestination', { query, userLocation })
  try {
    return JSON.parse(text?.replace(/```json|```/g, '').trim())
  } catch {
    return null
  }
}

// ── 3. Sketch Route Interpretation ───────────────────────────────────────
export async function interpretSketch({ startCoord, endCoord, pointCount, corridorMiles }) {
  return callProxy('interpretSketch', { startCoord, endCoord, pointCount, corridorMiles })
}

// ── 4. POI Query Refinement ───────────────────────────────────────────────
export async function refinePOISearch(userQuery, currentContext) {
  const text = await callProxy('refinePOI', { userQuery, context: currentContext })
  try {
    return JSON.parse(text?.replace(/```json|```/g, '').trim())
  } catch {
    return null
  }
}

// ── 5. Trip Summary ───────────────────────────────────────────────────────
export async function generateTripSummary({ distance, duration, destination }) {
  return callProxy('tripSummary', { distance, duration, destination })
}

// ── 6. Smart Route Suggestions ────────────────────────────────────────────
export async function getRouteSuggestions({ origin, destination, preferences }) {
  return callProxy('routeSuggestions', { origin, destination, preferences })
}
