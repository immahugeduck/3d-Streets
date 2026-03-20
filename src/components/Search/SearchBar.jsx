import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useStore, { PHASE } from '../../store/appStore'
import { searchPlaces } from '../../services/mapboxService'
import { parseDestination } from '../../services/anthropicService'
import styles from './SearchBar.module.css'

const QUICK_CATEGORIES = [
  { id: 'food',     label: '🍔 Food',       icon: '🍔' },
  { id: 'gas',      label: '⛽ Gas',        icon: '⛽' },
  { id: 'coffee',   label: '☕ Coffee',      icon: '☕' },
  { id: 'parking',  label: '🅿️ Parking',    icon: '🅿️' },
  { id: 'charging', label: '⚡ EV Charge',  icon: '⚡' },
  { id: 'hotel',    label: '🏨 Hotels',      icon: '🏨' },
]

let debounceTimer = null

export default function SearchBar() {
  const [focused, setFocused]   = useState(false)
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [loading, setLoading]   = useState(false)
  const inputRef = useRef(null)

  const setPhase       = useStore(s => s.setPhase)
  const setDestination = useStore(s => s.setDestination)
  const addWaypoint    = useStore(s => s.addWaypoint)
  const destination    = useStore(s => s.destination)
  const openAI         = useStore(s => s.openAI)
  const setShowSettings = useStore(s => s.setShowSettings)
  const setShowPOI     = useStore(s => s.setShowPOI)
  const setPoiCategory = useStore(s => s.setPoiCategory)
  const userLocation   = useStore(s => s.userLocation)
  const phase          = useStore(s => s.phase)

  // Don't show search when navigating
  if (phase === PHASE.NAVIGATING || phase === PHASE.SKETCHING) return null

  const hasActiveRoute = !!destination

  const doSearch = useCallback(async (q) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    const res = await searchPlaces(q, userLocation)
    setLoading(false)
    setResults(res)
  }, [userLocation])

  function onInput(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => doSearch(val), 320)
  }

  async function onKeyDown(e) {
    if (e.key === 'Enter' && query.trim()) {
      // Try AI parse first if query is natural language
      const parsed = await parseDestination(query, userLocation)
      if (parsed?.destination) {
        const res = await searchPlaces(parsed.destination, userLocation)
        if (res[0]) { selectResult(res[0]); return }
      }
      // Fall back to top search result
      if (results[0]) selectResult(results[0])
    }
    if (e.key === 'Escape') blur()
  }

  function selectResult(result) {
    setDestination(result)
    setPhase(PHASE.ROUTE_PREVIEW)
    setQuery('')
    setResults([])
    setFocused(false)
    inputRef.current?.blur()
  }

  function addResultAsStop(result, e) {
    e.stopPropagation()
    addWaypoint(result)
    setQuery('')
    setResults([])
    setFocused(false)
    inputRef.current?.blur()
  }

  function blur() {
    setFocused(false)
    setQuery('')
    setResults([])
  }

  function openCategory(catId) {
    setPoiCategory(catId)
    setShowPOI(true)
    blur()
  }

  return (
    <div className={styles.wrapper}>
      {/* Input row */}
      <div className={`${styles.inputRow} ${focused ? styles.focused : ''}`}>
        {!focused && (
          <motion.div
            className={styles.logo}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          >
            <span>▲</span>
          </motion.div>
        )}

        <div className={styles.inputWrap} onClick={() => { setFocused(true); inputRef.current?.focus() }}>
          <SearchIcon />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={onInput}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            placeholder={hasActiveRoute ? 'Search or add a stop…' : 'Where to?'}
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          {loading && <div className={styles.spinner} />}
          {query && !loading && (
            <button className={styles.clearBtn} onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}>✕</button>
          )}
        </div>

        {/* AI & Settings buttons when not focused */}
        {!focused ? (
          <div className={styles.rightBtns}>
            <button className={styles.aiBtn} onClick={openAI} title="AI Co-pilot">
              <span className={styles.aiBtnOrb} />
            </button>
            <button className={styles.menuBtn} onClick={() => setShowSettings(true)}>
              <MenuIcon />
            </button>
          </div>
        ) : (
          <button className={styles.cancelBtn} onClick={blur}>Cancel</button>
        )}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {focused && (
          <motion.div
            className={styles.dropdown}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {/* Quick categories (when no query) */}
            {!query && (
              <div className={styles.categories}>
                <div className={styles.sectionLabel}>NEARBY</div>
                <div className={styles.categoryGrid}>
                  {QUICK_CATEGORIES.map(cat => (
                    <button key={cat.id} className={styles.catChip} onClick={() => openCategory(cat.id)}>
                      <span className={styles.catEmoji}>{cat.icon}</span>
                      <span className={styles.catLabel}>{cat.id.charAt(0).toUpperCase() + cat.id.slice(1)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            {results.length > 0 && (
              <div className={styles.results}>
                {hasActiveRoute && (
                  <div className={`${styles.sectionLabel} ${styles.stopHint}`}>TAP TO SET DESTINATION · + TO ADD STOP</div>
                )}
                {results.map((r, i) => (
                  <button key={r.id} className={styles.resultRow} onClick={() => selectResult(r)}>
                    <div className={styles.resultIcon}>
                      <PinIcon />
                    </div>
                    <div className={styles.resultText}>
                      <div className={styles.resultName}>{r.name}</div>
                      <div className={styles.resultAddr}>{r.address}</div>
                    </div>
                    {r.distance && (
                      <div className={styles.resultDist}>{formatDist(r.distance)}</div>
                    )}
                    {hasActiveRoute && (
                      <button
                        className={styles.addStopBtn}
                        onClick={(e) => addResultAsStop(r, e)}
                        title="Add as stop"
                      >
                        +
                      </button>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* AI hint */}
            {query.length > 3 && results.length === 0 && !loading && (
              <div className={styles.aiHint}>
                <span className={styles.aiHintIcon}>✦</span>
                <span>Press Enter — AI will interpret your destination</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function formatDist(m) {
  if (!m) return ''
  const mi = m / 1609.34
  return mi < 0.1 ? `${Math.round(m)} ft` : `${mi.toFixed(1)} mi`
}

const SearchIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)
const PinIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
)
const MenuIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)
