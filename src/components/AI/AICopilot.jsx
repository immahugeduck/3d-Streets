import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useStore, { PHASE } from '../../store/appStore'
import { sendCopilotMessage, getLastClaudeError, getLastClaudeMeta } from '../../services/anthropicService'
import styles from './AICopilot.module.css'

const QUICK_PROMPTS = [
  { label: '⛽ Gas near me',         text: 'Find me the closest gas station' },
  { label: '🍔 Food along route',    text: 'Find a good restaurant along my route' },
  { label: '☕ Coffee stop',          text: 'I need a coffee stop soon' },
  { label: '🅿️ Parking ahead',       text: 'Find parking near my destination' },
  { label: '⚡ EV charging',          text: 'Find an EV charging station nearby' },
  { label: '🏨 Hotels tonight',       text: 'Find hotels near my destination' },
]

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
    let cleanReply = reply
    const destMatch = reply.match(/DESTINATION::(.+)/)
    const wpMatch   = reply.match(/WAYPOINT::(.+)/)

    if (destMatch) {
      cleanReply = reply.replace(/DESTINATION::.+/, '').trim()
      // Trigger geocode for destination
      handleAIDestination(destMatch[1].trim())
    } else if (wpMatch) {
      cleanReply = reply.replace(/WAYPOINT::.+/, '').trim()
      handleAIWaypoint(wpMatch[1].trim())
    }

    addMessage({ role: 'assistant', content: cleanReply })
  }

  async function handleAIDestination(placeName) {
    const { searchPlaces } = await import('../../services/mapboxService')
    const results = await searchPlaces(placeName, userLocation)
    if (results[0]) {
      setDestination(results[0])
      setPhase(PHASE.ROUTE_PREVIEW)
    }
  }

  async function handleAIWaypoint(placeName) {
    const { searchPlaces } = await import('../../services/mapboxService')
    const results = await searchPlaces(placeName, userLocation)
    if (results[0]) addWaypoint(results[0])
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
