// ── Anthropic Claude API Service ──────────────────────────────────────────

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL   = 'claude-3-5-haiku-20241022'

async function callClaude(systemPrompt, userMessage, maxTokens = 300) {
  if (!ANTHROPIC_API_KEY) return null
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.content?.[0]?.text ?? null
  } catch {
    return null
  }
}

// ── Parse natural-language destination query ──────────────────────────────
export async function parseDestination(query, userLocation) {
  if (!query) return null
  const system = `You are a navigation assistant. Parse the user's query and extract the destination name.
Return JSON: {"destination": "<place name or address>"}
If the query is unclear, make a reasonable guess. Only return the JSON object, nothing else.`
  const text = await callClaude(system, query, 100)
  if (!text) return null
  try {
    return JSON.parse(text.trim())
  } catch {
    return null
  }
}

// ── Generate AI trip summary ──────────────────────────────────────────────
export async function generateTripSummary({ distance, duration, destination }) {
  const system = `You are a friendly navigation assistant. Write a short, one-sentence trip summary (max 20 words).
Be concise and helpful. No markdown or emojis.`
  const msg = `Trip to ${destination}: ${distance}, approximately ${duration}.`
  return callClaude(system, msg, 80)
}

// ── Navigation co-pilot ───────────────────────────────────────────────────
export async function askCopilot(message, context = {}) {
  const system = `You are a helpful navigation co-pilot for a 3D mapping app. 
You help users with routes, destinations, and points of interest.
When suggesting a destination, prefix it with [DESTINATION: place name].
When suggesting a waypoint, prefix it with [WAYPOINT: place name].
Keep responses short and conversational (under 80 words).`
  const ctx = context.destination ? `Current destination: ${context.destination}. ` : ''
  return callClaude(system, ctx + message, 200)
}

// ── Search POI via AI ─────────────────────────────────────────────────────
export async function searchPOIAI(category, location) {
  const system = `Suggest 3 real ${category} locations near the given coordinates.
Return JSON array: [{"name": "...", "address": "..."}]
Only return the JSON array.`
  const msg = `Near coordinates: ${location?.lat?.toFixed(4)}, ${location?.lng?.toFixed(4)}`
  const text = await callClaude(system, msg, 300)
  if (!text) return []
  try {
    return JSON.parse(text.trim())
  } catch {
    return []
  }
}

// ── Interpret sketch as route ─────────────────────────────────────────────
export async function interpretSketch(sketchInfo) {
  const system = `You are a route interpreter. Given sketch information, suggest a brief route description.
Return a short one-sentence description of what this route might be (max 15 words). No JSON, just plain text.`
  const msg = typeof sketchInfo === 'string'
    ? sketchInfo
    : `Route from ${sketchInfo.startCoord?.lat?.toFixed(3)},${sketchInfo.startCoord?.lng?.toFixed(3)} to ${sketchInfo.endCoord?.lat?.toFixed(3)},${sketchInfo.endCoord?.lng?.toFixed(3)}, approximately ${sketchInfo.corridorMiles?.toFixed(1)} miles.`
  return callClaude(system, msg, 80)
}
