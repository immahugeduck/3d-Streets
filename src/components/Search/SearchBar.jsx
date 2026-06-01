import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useStore, { PHASE } from '../../store/appStore'
import { searchPlaces, resolvePlaceCoords } from '../../services/googlePlacesService'
import { parseDestination } from '../../services/anthropicService'
import styles from './SearchBar.module.css'

const QUICK_CATEGORIES = [
  { id: 'food',     label: 'Food',      icon: '🍽️' },
  { id: 'gas',      label: 'Gas',       icon: '⛽' },
  { id: 'coffee',   label: 'Coffee',    icon: '☕' },
  { id: 'parking',  label: 'Parking',   icon: '🅿️' },
  { id: 'charging', label: 'EV Charge', icon: '⚡' },
  { id: 'hotel',    label: 'Hotels',    icon: '🏨' },
]

const RECENT_KEY = 'nav_recent_searches'
const MAX_RECENT = 5

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}

function saveRecent(place) {
  const prev = loadRecent().filter(r => r.id !== place.id)
  const next = [
    { id: place.id, name: place.name, address: place.address, lat: place.lat, lng: place.lng },
    ...prev,
  ].slice(0, MAX_RECENT)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch {}
}

function getPlaceEmoji(maki, category, placeType) {
  const m = (maki     || '').toLowerCase()
  const c = (category || '').toLowerCase()
  if (m === 'fuel'       || c.includes('gas')        || c.includes('fuel'))                   return '⛽'
  if (m === 'grocery'    || c.includes('grocery')    || c.includes('supermarket'))             return '🛒'
  if (m === 'restaurant' || m === 'fast-food'        || c.includes('restaurant') || c.includes('food')) return '🍽️'
  if (m === 'cafe'       || c.includes('coffee')     || c.includes('cafe'))                    return '☕'
  if (m === 'lodging'    || c.includes('hotel')      || c.includes('motel'))                   return '🏨'
  if (m === 'parking'    || c.includes('parking'))                                             return '🅿️'
  if (m === 'hospital'   || c.includes('hospital')   || c.includes('medical'))                 return '🏥'
  if (m === 'pharmacy'   || c.includes('pharmacy'))                                            return '💊'
  if (m === 'bank'       || c.includes('bank')       || c.includes('atm'))                     return '🏦'
  if (m === 'airport'    || c.includes('airport'))                                             return '✈️'
  if (m === 'shopping'   || c.includes('shop')       || c.includes('mall'))                    return '🛍️'
  if (m === 'bar'        || c.includes('bar')        || c.includes('pub'))                     return '🍺'
  if (m === 'cinema'     || c.includes('movie')      || c.includes('theater'))                 return '🎬'
  if (m === 'park'       || c.includes('park'))                                                return '🌳'
  if (placeType === 'place')                                                                   return '🏙️'
  return '📍'
}

function formatDist(m) {
  if (!m) return ''
  const mi = m / 1609.34
  if (mi < 0.1) return `${Math.round(m * 3.28084)} ft`
  return `${mi.toFixed(1)} mi`
}

let debounceTimer = null

export default function SearchBar() {
  const [focused, setFocused] = useState(false)
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [recent, setRecent]   = useState(loadRecent)
  const inputRef = useRef(null)

  const setPhase        = useStore(s => s.setPhase)
  const setDestination  = useStore(s => s.setDestination)
  const openAI          = useStore(s => s.openAI)
  const setShowSettings = useStore(s => s.setShowSettings)
  const setShowPOI      = useStore(s => s.setShowPOI)
  const setPoiCategory  = useStore(s => s.setPoiCategory)
  const userLocation    = useStore(s => s.userLocation)
  const phase           = useStore(s => s.phase)

  const doSearch = useCallback(async (q) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    const res = await searchPlaces(q, userLocation)
    setLoading(false)
    setResults(res)
  }, [userLocation])

  // All hooks declared above this point
  if (phase === PHASE.NAVIGATING || phase === PHASE.SKETCHING) return null

  function onInput(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => doSearch(val), 320)
  }

  async function onKeyDown(e) {
    if (e.key === 'Enter' && query.trim()) {
      const parsed = await parseDestination(query, userLocation)
      if (parsed?.name) {
        const aiQuery = parsed.address ? `${parsed.name}, ${parsed.address}` : parsed.name
        const res = await searchPlaces(aiQuery, userLocation)
        if (res[0]) { selectResult(res[0]); return }
      }
      if (results[0]) selectResult(results[0])
    }
    if (e.key === 'Escape') closeDropdown()
  }

  async function selectResult(place) {
    let resolved = place
    if (place.needsDetails && place.placeId) {
      setLoading(true)
      const details = await resolvePlaceCoords(place.placeId)
      setLoading(false)
      if (details?.lat == null) return
      resolved = {
        ...place,
        lat:     details.lat,
        lng:     details.lng,
        name:    details.name    || place.name,
        address: details.address || place.address,
      }
    }
    saveRecent(resolved)
    setRecent(loadRecent())
    setDestination(resolved)
    setPhase(PHASE.ROUTE_PREVIEW)
    setQuery('')
    setResults([])
    setFocused(false)
    inputRef.current?.blur()
  }

  function selectRecent(r) {
    setDestination(r)
    setPhase(PHASE.ROUTE_PREVIEW)
    setQuery('')
    setResults([])
    setFocused(false)
    inputRef.current?.blur()
  }

  function clearRecent() {
    try { localStorage.removeItem(RECENT_KEY) } catch {}
    setRecent([])
  }

  function closeDropdown() {
    setFocused(false)
    setQuery('')
    setResults([])
  }

  function openCategory(catId) {
    setPoiCategory(catId)
    setShowPOI(true)
    closeDropdown()
  }

  const showRecent     = focused && !query && recent.length > 0
  const showCategories = focused && !query

  return (
    <div className={styles.wrapper}>
      {/* Input row */}
      <div className={`${styles.inputRow} ${focused ? styles.focused : ''}`}>
        {!focused && (
          <motion.div className={styles.logo} initial={{ scale: 0 }} animate={{ scale: 1 }}>
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
            placeholder="Where to?"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          {loading && <div className={styles.spinner} />}
          {query && !loading && (
            <button
              className={styles.clearBtn}
              onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
            >✕</button>
          )}
        </div>

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
          <button className={styles.cancelBtn} onClick={closeDropdown}>Cancel</button>
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
            {/* Recent searches */}
            {showRecent && (
              <div className={styles.recentSection}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionLabel}>RECENT</span>
                  <button className={styles.clearRecentBtn} onClick={clearRecent}>Clear</button>
                </div>
                {recent.map(r => (
                  <button key={r.id} className={styles.resultRow} onClick={() => selectRecent(r)}>
                    <div className={styles.resultIcon}>
                      <span className={styles.resultEmoji}>🕐</span>
                    </div>
                    <div className={styles.resultText}>
                      <div className={styles.resultName}>{r.name}</div>
                      {r.address && <div className={styles.resultAddr}>{r.address}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Quick categories */}
            {showCategories && (
              <div className={styles.categories}>
                <div className={styles.sectionLabel}>NEARBY</div>
                <div className={styles.categoryGrid}>
                  {QUICK_CATEGORIES.map(cat => (
                    <button key={cat.id} className={styles.catChip} onClick={() => openCategory(cat.id)}>
                      <span className={styles.catEmoji}>{cat.icon}</span>
                      <span className={styles.catLabel}>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search results */}
            {results.length > 0 && (
              <div className={styles.results}>
                {results.map(r => (
                  <button key={r.id} className={styles.resultRow} onClick={() => selectResult(r)}>
                    <div className={styles.resultIcon}>
                      <span className={styles.resultEmoji}>
                        {r.emoji || getPlaceEmoji(r.maki, r.category, r.placeType)}
                      </span>
                    </div>
                    <div className={styles.resultText}>
                      <div className={styles.resultName}>{r.name}</div>
                      <div className={styles.resultAddr}>{r.address}</div>
                    </div>
                    {r.distance != null && (
                      <div className={styles.resultDist}>{formatDist(r.distance)}</div>
                    )}
                    {r.needsDetails && (
                      <div className={styles.resultDist} style={{ opacity: 0.4, fontSize: '10px' }}>G</div>
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

const SearchIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)
const MenuIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)
