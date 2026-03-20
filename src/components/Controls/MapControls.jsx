import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useStore, { MAP_STYLES, PHASE } from '../../store/appStore'
import { flyToUser } from '../Map/MapView'
import styles from './MapControls.module.css'

export default function MapControls() {
  const [showStyles, setShowStyles] = useState(false)

  const phase             = useStore(s => s.phase)
  const mapStyle          = useStore(s => s.mapStyle)
  const setMapStyle       = useStore(s => s.setMapStyle)
  const is3D              = useStore(s => s.is3D)
  const setIs3D           = useStore(s => s.setIs3D)
  const enterSketch       = useStore(s => s.enterSketch)
  const setShowPOI        = useStore(s => s.setShowPOI)
  const openAI            = useStore(s => s.openAI)
  const destination       = useStore(s => s.destination)
  const savedRoute        = useStore(s => s.savedRoute)
  const saveCurrentRoute  = useStore(s => s.saveCurrentRoute)
  const restoreSavedRoute = useStore(s => s.restoreSavedRoute)
  const clearSavedRoute   = useStore(s => s.clearSavedRoute)

  // Hide during navigation/sketch
  if (phase === PHASE.NAVIGATING || phase === PHASE.SKETCHING) return null

  function handleCompass() {
    if (destination) {
      // Save current route if not already saved, or clear if same route is saved
      if (savedRoute && savedRoute.destination?.id === destination.id) {
        clearSavedRoute()
      } else {
        saveCurrentRoute()
      }
    } else if (savedRoute) {
      // Restore the previously saved route
      restoreSavedRoute()
    }
  }

  const routeIsSaved = savedRoute &&
    destination &&
    savedRoute.destination?.id === destination.id

  function getCompassTitle() {
    if (routeIsSaved) return 'Route saved – tap to unsave'
    if (destination) return 'Save this route'
    if (savedRoute) return `Restore: ${savedRoute.destination?.name ?? 'saved route'}`
    return 'No route to save'
  }

  return (
    <div className={styles.rail}>
      {/* Locate me */}
      <button className={`${styles.btn} ${styles.accent}`} onClick={flyToUser} title="My location">
        <LocateIcon />
      </button>

      {/* 3D toggle */}
      <button className={`${styles.btn} ${is3D ? styles.active : ''}`} onClick={() => setIs3D(!is3D)} title="3D / Flat">
        <span className={styles.label3d}>{is3D ? '3D' : '2D'}</span>
      </button>

      {/* Map style picker */}
      <div className={styles.styleWrap}>
        <button className={styles.btn} onClick={() => setShowStyles(s => !s)} title="Map style">
          <LayersIcon />
        </button>
        <AnimatePresence>
          {showStyles && (
            <motion.div
              className={styles.styleMenu}
              initial={{ opacity: 0, scale: 0.85, x: 8 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.85, x: 8 }}
              transition={{ duration: 0.18 }}
            >
              {Object.entries(MAP_STYLES).map(([key, s]) => (
                <button
                  key={key}
                  className={`${styles.styleOption} ${mapStyle === key ? styles.styleActive : ''}`}
                  onClick={() => { setMapStyle(key); setShowStyles(false) }}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Compass – save / restore route */}
      <button
        className={`${styles.btn} ${routeIsSaved ? styles.active : ''} ${!destination && savedRoute ? styles.accent : ''}`}
        onClick={handleCompass}
        title={getCompassTitle()}
      >
        <CompassIcon />
        {savedRoute && !destination && (
          <span className={styles.savedDot} />
        )}
      </button>

      {/* Sketch */}
      <button className={styles.btn} onClick={enterSketch} title="Draw route">
        <PencilIcon />
      </button>

      {/* POI */}
      <button className={styles.btn} onClick={() => setShowPOI(true)} title="Search nearby">
        <SearchIcon />
      </button>

      {/* AI co-pilot */}
      <button className={`${styles.btn} ${styles.aiBtn}`} onClick={openAI} title="AI Co-pilot">
        <span className={styles.aiOrb} />
      </button>
    </div>
  )
}

const LocateIcon  = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="9" strokeDasharray="3 3" opacity=".4"/></svg>
const LayersIcon  = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
const PencilIcon  = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const SearchIcon  = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
const CompassIcon = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
