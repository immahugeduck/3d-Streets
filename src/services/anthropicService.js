// ── Anthropic Claude Service ──────────────────────────────────────────────
// All AI features flow through here:
//  1. Co-pilot chat (navigation assistant)
//  2. Sketch route description
//  3. Natural language destination parsing
//  4. POI query refinement
//  5. Trip summaries

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
const BASE_URL = 'https://api.anthropic.com/v1/messages'
const MODEL    = 'claude-sonnet-4-20250514'

// Core fetch wrapper
async function callClaude({ system, messages, maxTokens = 512 }) {
  if (!API_KEY) {
    console.warn('No Anthropic API key set. Add VITE_ANTHROPIC_API_KEY to .env')
    return null
  }

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Claude API error:', err)
    return null
  }

  const data = await res.json()
  return data.content?.[0]?.text ?? null
}

// ── 1. Navigation Co-pilot ────────────────────────────────────────────────
// Multi-turn conversational assistant embedded in the map.
export async function sendCopilotMessage({ history, userMessage, context }) {
  const { userLocation, destination, routeSteps, currentStepIndex } = context

  const system = `You are 3D Streets AI — a calm, expert navigation co-pilot embedded in a premium GPS app.
You have access to:
- User's current location: ${userLocation ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` : 'unknown'}
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
Never make up places — only suggest real, well-known locations.`

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ]

  return callClaude({ system, messages, maxTokens: 400 })
}

// ── 2. Parse Destination from Natural Language ────────────────────────────
export async function parseDestination(query, userLocation) {
  const text = await callClaude({
    system: `Extract a navigation destination from user input. Return JSON only, no markdown.
Format: {"name":"place name","address":"full address or city state","type":"address|poi|relative","confidence":0.0-1.0}
If unclear: {"name":null}`,
    messages: [{ role: 'user', content: `User at ${userLocation?.lat?.toFixed(3)},${userLocation?.lng?.toFixed(3)} said: "${query}"` }],
    maxTokens: 150,
  })

  try {
    return JSON.parse(text?.replace(/```json|```/g, '').trim())
  } catch {
    return null
  }
}

// ── 3. Sketch Route Interpretation ───────────────────────────────────────
export async function interpretSketch({ startCoord, endCoord, pointCount, corridorMiles }) {
  return callClaude({
    system: 'You are a navigation AI. Describe a drawn route in 1 short sentence. Be specific about road types (highway, coastal, backroad, downtown, etc). Confident tone. No quotes.',
    messages: [{
      role: 'user',
      content: `Drawn route: start ${startCoord.lat.toFixed(3)},${startCoord.lng.toFixed(3)} → end ${endCoord.lat.toFixed(3)},${endCoord.lng.toFixed(3)}. Points drawn: ${pointCount}. Corridor: ~${corridorMiles.toFixed(1)} miles wide.`
    }],
    maxTokens: 80,
  })
}

// ── 4. POI Query Refinement ───────────────────────────────────────────────
export async function refinePOISearch(userQuery, currentContext) {
  const text = await callClaude({
    system: `Parse a POI search query for a navigation app. Return JSON only.
Format: {"category":"gas|food|coffee|parking|charging|hotel|hospital","searchQuery":"mapbox search string","preferAlongRoute":bool,"maxDetourMiles":number}`,
    messages: [{ role: 'user', content: `Query: "${userQuery}". Context: ${JSON.stringify(currentContext)}` }],
    maxTokens: 120,
  })

  try {
    return JSON.parse(text?.replace(/```json|```/g, '').trim())
  } catch {
    return null
  }
}

// ── 5. Trip Summary ───────────────────────────────────────────────────────
export async function generateTripSummary({ distance, duration, destination }) {
  return callClaude({
    system: 'Generate a one-line friendly trip opener for a GPS app co-pilot. Under 10 words. Warm, like a smart travel companion. No quotes.',
    messages: [{ role: 'user', content: `${distance} to ${destination}, ~${duration}` }],
    maxTokens: 40,
  })
}

// ── 6. Smart Route Suggestions ────────────────────────────────────────────
export async function getRouteSuggestions({ origin, destination, preferences }) {
  return callClaude({
    system: `You are a routing expert. Given a trip, suggest 2-3 interesting routing options in JSON array.
Format: [{"label":"Option name","description":"1 sentence why","type":"fastest|scenic|avoid_highways|avoid_tolls"}]`,
    messages: [{
      role: 'user',
      content: `From: ${origin.name ?? 'current location'}. To: ${destination}. Prefs: ${preferences.join(', ')}`
    }],
    maxTokens: 300,
  })
}
