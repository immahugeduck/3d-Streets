import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useStore, { PHASE } from '../../store/appStore'
import { sendCopilotMessage, getLastClaudeError, getLastClaudeMeta, parseDestination } from '../../services/anthropicService'
import styles from './AICopilot.module.css'

const QUICK_PROMPTS = [
  { label: '⛽ Gas near me',         text: 'Find me the closest gas station' },
  { label: '🍔 Food along route',    text: 'Find a good restaurant along my route' },
  { label: '☕ Coffee stop',          text: 'I need a coffee stop soon' },
  { label: '🅿️ Parking ahead',       text: 'Find parking near my destination' },
  { label: '⚡ EV charging',          text: 'Find an EV charging station nearby' },
  { label: '🏨 Hotels tonight',       text: 'Find hotels near my destination' },
]

const TAG_DESTINATION = 'DESTINATION'
const TAG_WAYPOINT = 'WAYPOINT'
const DESTINATION_INTENT_RE = /\b(go to|take me to|navigate to|direction to|directions to|route to|find|search for|locate|closest|nearest)\b/i
const ACTION_TAG_REGEX = {
  [TAG_DESTINATION]: /(?:^|\n)\s*DESTINATION::([^\n]+)/i,
  [TAG_WAYPOINT]: /(?:^|\n)\s*WAYPOINT::([^\n]+)/i,
}
const ACTION_TAG_STRIP_REGEX = /(?:^|\n)\s*(?:DESTINATION|WAYPOINT)::[^\n]+/gi

function extractActionTag(text, tag) {
  const match = text.match(ACTION_TAG_REGEX[tag])
  return match?.[1]?.trim() || ''
}

function stripActionTags(text) {
  return text.replace(ACTION_TAG_STRIP_REGEX, '').trim()
}

export default function AICopilot() {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const closeAI       = useStore(s => s.closeAI)
  const messages      = useStore(s => s.aiMessages)
  const addMessage    = useStore(s => s.addAIMessage)
  const aiThinking    = useStore(s => s.aiThinking)
  const setAIThinking = useStore(s => s.setAIThinking)
  const userLocation  = useStore(s => s.userLocation)
  const destination   = useStore(s => s.destination)
  const routeSteps    = useStore(s => s.routeSteps)
  const currentStepIndex = useStore(s => s.currentStepIndex)
  const setDestination = useStore(s => s.setDestination)
  const setPhase       = useStore(s => s.setPhase)
  const addWaypoint    = useStore(s => s.addWaypoint)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, aiThinking])

  useEffect(() => {
    // Welcome message
    if (messages.length === 0) {
      addMessage({
        role: 'assistant',
        content: destination
          ? `Heading to **${destination.name}**. How can I help? Ask me to find stops, change routes, or anything about your trip.`
          : `Hi! I'm your 3D Streets co-pilot. Tell me where you want to go, or ask me to find something nearby.`,
      })
    }
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  async function send(text) {
    const userText = (text ?? input).trim()
    if (!userText || aiThinking) return
    setInput('')

    addMessage({ role: 'user', content: userText })
    setAIThinking(true)

    let reply = null
    try {
      reply = await sendCopilotMessage({
        history: messages.slice(-8),
        userMessage: userText,
        context: { userLocation, destination, routeSteps, currentStepIndex },
      })
    } finally {
      setAIThinking(false)
    }

    if (!reply) {
      const details = getLastClaudeError()
      const meta = getLastClaudeMeta()
      const ref = meta?.requestId ? ` (Ref: ${meta.requestId})` : ''
      addMessage({
        role: 'assistant',
        content: details
          ? `I couldn't respond right now. ${details}${ref}`
          : `I couldn't respond right now. Check your Anthropic key in .env or .env.local.${ref}`,
      })
      return
    }

    // Parse action tags
    let cleanReply = stripActionTags(reply)
    const destTag = extractActionTag(reply, TAG_DESTINATION)
    const wpTag   = extractActionTag(reply, TAG_WAYPOINT)
    let resolvedDestination = null
    let attemptedDestinationLookup = false

    if (destTag) {
      attemptedDestinationLookup = true
      resolvedDestination = await handleAIDestination(destTag)
    } else if (wpTag) {
      await handleAIWaypoint(wpTag)
    } else if (!destination && DESTINATION_INTENT_RE.test(userText)) {
      attemptedDestinationLookup = true
      resolvedDestination = await handleNaturalLanguageDestination(userText)
    }

    if (!cleanReply) {
      if (resolvedDestination) {
        cleanReply = `Got it — heading to **${resolvedDestination.name}**.`
      } else if (attemptedDestinationLookup) {
        cleanReply = `I couldn't find that destination yet. Try adding a city or state.`
      } else {
        cleanReply = 'Got it.'
      }
    }

    addMessage({ role: 'assistant', content: cleanReply })
  }

  async function handleAIDestination(placeName) {
    const { searchPlaces } = await import('../../services/mapboxService')
    const results = await searchPlaces(placeName, userLocation)
    if (results[0]) {
      setDestination(results[0])
      setPhase(PHASE.ROUTE_PREVIEW)
      return results[0]
    }
    return null
  }

  async function handleAIWaypoint(placeName) {
    const { searchPlaces } = await import('../../services/mapboxService')
    const results = await searchPlaces(placeName, userLocation)
    if (results[0]) {
      addWaypoint(results[0])
      return results[0]
    }
    return null
  }

  async function handleNaturalLanguageDestination(text) {
    const parsed = await parseDestination(text, userLocation)
    if (!parsed?.name) {
      console.warn('[AICopilot] parseDestination returned no structured place; falling back to raw text search', { text })
    }
    const destinationQuery = parsed?.name
      ? (parsed.address ? `${parsed.name}, ${parsed.address}` : parsed.name)
      : text
    return handleAIDestination(destinationQuery)
  }

  return (
    <motion.div
      className={styles.panel}
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.aiOrb}>
            <span className={styles.aiOrbInner} />
          </div>
          <div>
            <div className={styles.title}>AI Co-Pilot</div>
            <div className={styles.subtitle}>Powered by Claude</div>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={closeAI}>✕</button>
      </div>

      <div className={styles.divider} />

      {/* Quick prompts */}
      {messages.length <= 1 && (
        <div className={styles.quickPrompts}>
          {QUICK_PROMPTS.map(p => (
            <button key={p.text} className={styles.quickChip} onClick={() => send(p.text)}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className={styles.messages}>
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              className={`${styles.message} ${msg.role === 'user' ? styles.user : styles.assistant}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {msg.role === 'assistant' && (
                <div className={styles.assistantIcon}>✦</div>
              )}
              <div className={styles.bubble}>
                <MarkdownText text={msg.content} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Thinking indicator */}
        {aiThinking && (
          <motion.div
            className={`${styles.message} ${styles.assistant}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className={styles.assistantIcon}>✦</div>
            <div className={styles.bubble}>
              <div className={styles.thinkingDots}>
                <span /><span /><span />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={styles.inputRow}>
        <input
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask your co-pilot anything…"
          disabled={aiThinking}
        />
        <button
          className={styles.sendBtn}
          onClick={() => send()}
          disabled={!input.trim() || aiThinking}
        >
          <SendIcon />
        </button>
      </div>
    </motion.div>
  )
}

// Simple markdown: **bold** and line breaks
function MarkdownText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </span>
  )
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
