import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import useStore, { PHASE } from '../../store/appStore'
import { askCopilot } from '../../services/anthropicService'
import { searchPlaces } from '../../services/mapboxService'
import styles from './AICopilot.module.css'

const QUICK_PROMPTS = [
  'Find me a gas station',
  'Best route to avoid traffic',
  'Add a coffee stop',
  'How long until I arrive?',
]

export default function AICopilot() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! I\'m your AI co-pilot. Where would you like to go?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  const setPhase           = useStore(s => s.setPhase)
  const phase              = useStore(s => s.phase)
  const destination        = useStore(s => s.destination)
  const setDestinationOnly = useStore(s => s.setDestinationOnly)
  const addWaypoint        = useStore(s => s.addWaypoint)
  const waypoints          = useStore(s => s.waypoints)
  const userLocation       = useStore(s => s.userLocation)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text) {
    if (!text?.trim() || loading) return
    const userMsg = text.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)

    const context = {
      destination: destination?.name,
      waypoints,
    }
    const reply = await askCopilot(userMsg, context)

    if (reply) {
      // Parse DESTINATION tag
      const destMatch = reply.match(/\[DESTINATION:\s*([^\]]+)\]/i)
      // Parse ALL WAYPOINT tags
      const wpMatches = [...reply.matchAll(/\[WAYPOINT:\s*([^\]]+)\]/gi)]

      if (destMatch) {
        const places = await searchPlaces(destMatch[1].trim(), userLocation)
        if (places[0]) {
          // Set destination without changing phase yet; we'll transition after all stops are added
          setDestinationOnly(places[0])
        }
      }

      // Handle all waypoint tags – resolve searches in parallel for speed
      const wpResults = await Promise.all(
        wpMatches.map(wpMatch => searchPlaces(wpMatch[1].trim(), userLocation))
      )
      wpResults.forEach(places => {
        if (places[0]) addWaypoint(places[0])
      })

      // Transition to route preview after all stops are resolved
      if (destMatch) {
        setPhase(PHASE.ROUTE_PREVIEW)
      }

      const cleanReply = reply
        .replace(/\[DESTINATION:[^\]]+\]/gi, '')
        .replace(/\[WAYPOINT:[^\]]+\]/gi, '')
        .trim()

      if (cleanReply) {
        setMessages(prev => [...prev, { role: 'assistant', text: cleanReply }])
      }
    } else {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I couldn\'t process that. Try asking again.' }])
    }
    setLoading(false)
  }

  function close() {
    // Return to route preview if a destination is active, otherwise go idle
    if (destination) {
      setPhase(PHASE.ROUTE_PREVIEW)
    } else {
      setPhase(PHASE.IDLE)
    }
  }

  return (
    <>
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      />
      <motion.div
        className={styles.panel}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 40 }}
      >
        <div className={styles.handle} />
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.aiOrb} />
            <div className={styles.headerTitle}>AI Co-Pilot</div>
          </div>
          <button className={styles.closeBtn} onClick={close}>✕</button>
        </div>

        {/* Messages */}
        <div className={styles.messages}>
          {messages.map((msg, i) => (
            <div key={i} className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.aiBubble}`}>
              {msg.text}
            </div>
          ))}
          {loading && (
            <div className={`${styles.bubble} ${styles.aiBubble} ${styles.loadingBubble}`}>
              <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick prompts */}
        <div className={styles.quickPrompts}>
          {QUICK_PROMPTS.map(p => (
            <button key={p} className={styles.quickChip} onClick={() => send(p)}>{p}</button>
          ))}
        </div>

        {/* Input */}
        <div className={styles.inputRow}>
          <input
            className={styles.input}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            placeholder="Ask anything…"
            autoComplete="off"
          />
          <button
            className={styles.sendBtn}
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
          >
            ▶
          </button>
        </div>
      </motion.div>
    </>
  )
}
