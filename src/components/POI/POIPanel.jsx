import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import useStore from '../../store/appStore'
import { searchPOI } from '../../services/mapboxService'
import styles from './POIPanel.module.css'

const CATEGORIES = [
  { id: 'food',     label: 'Food',     emoji: '🍔' },
  { id: 'gas',      label: 'Gas',      emoji: '⛽' },
  { id: 'coffee',   label: 'Coffee',   emoji: '☕' },
  { id: 'parking',  label: 'Parking',  emoji: '🅿️' },
  { id: 'charging', label: 'EV',       emoji: '⚡' },
  { id: 'hotel',    label: 'Hotels',   emoji: '🏨' },
  { id: 'hospital', label: 'Hospital', emoji: '🏥' },
]

export default function POIPanel() {
  const [results, setResults]   = useState([])
  const [loading, setLoading]   = useState(true)

  const setShowPOI     = useStore(s => s.setShowPOI)
  const poiCategory    = useStore(s => s.poiCategory)
  const setPoiCategory = useStore(s => s.setPoiCategory)
  const userLocation   = useStore(s => s.userLocation)
  const isNavigating   = useStore(s => s.phase === 'navigating')
  const addWaypoint    = useStore(s => s.addWaypoint)
  const setDestination = useStore(s => s.setDestination)
  const setPhase       = useStore(s => s.setPhase)

  useEffect(() => { load() }, [poiCategory])

  async function load() {
    if (!userLocation) return
    setLoading(true)
    const res = await searchPOI(poiCategory, userLocation)
    setResults(res)
    setLoading(false)
  }

  function select(place) {
    if (isNavigating) {
      addWaypoint(place)
      setShowPOI(false)
    } else {
      setDestination(place)
      setPhase('route_preview')
      setShowPOI(false)
    }
  }

  return (
    <motion.div
      className={styles.panel}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 40 }}
    >
      <div className={styles.handle} />

      <div className={styles.header}>
        <div>
          <div className={styles.title}>Nearby</div>
          <div className={styles.subtitle}>Sorted closest first</div>
        </div>
        <button className={styles.closeBtn} onClick={() => setShowPOI(false)}>✕</button>
      </div>

      {/* Category tabs */}
      <div className={styles.catScroll}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`${styles.catTab} ${poiCategory === cat.id ? styles.active : ''}`}
            onClick={() => setPoiCategory(cat.id)}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.divider} />

      {/* Results */}
      <div className={styles.list}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`${styles.row} ${styles.shimmer}`} style={{ height: 64 }} />
          ))
        ) : results.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyEmoji}>{CATEGORIES.find(c => c.id === poiCategory)?.emoji ?? '📍'}</div>
            <div>No {poiCategory} found nearby</div>
          </div>
        ) : results.map((place, i) => (
          <button key={place.id} className={styles.row} onClick={() => select(place)}>
            <div className={styles.rank}>{i + 1}</div>
            <div className={styles.info}>
              <div className={styles.name}>{place.name}</div>
              <div className={styles.addr}>{place.address}</div>
            </div>
            <div className={styles.dist}>
              <div className={styles.distValue}>{place.distanceLabel}</div>
              <div className={styles.distLabel}>away</div>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  )
}
