import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useStore from '../../store/appStore'
import styles from './RouteStopsPanel.module.css'

const STOP_ICONS = ['⛳', '📍', '🏁', '⭐', '🔵', '🟢', '🟡']

function getStopIcon(stop) {
  if (stop.isFinal) return '🏁'
  return STOP_ICONS[((stop.index - 1) % (STOP_ICONS.length - 1))]
}

export default function RouteStopsPanel() {
  const [confirmRemoveId, setConfirmRemoveId] = useState(null)

  const setShowRouteStops = useStore(s => s.setShowRouteStops)
  const getAllStops        = useStore(s => s.getAllStops)
  const removeWaypoint    = useStore(s => s.removeWaypoint)
  const setSelectedStop   = useStore(s => s.setSelectedStop)
  const selectedStop      = useStore(s => s.selectedStop)
  const eta               = useStore(s => s.eta)
  const remainingDist     = useStore(s => s.remainingDist)
  const waypoints         = useStore(s => s.waypoints)
  const destination       = useStore(s => s.destination)

  const stops = getAllStops()

  function handleStopClick(stop) {
    setSelectedStop(stop)
    // Fly to stop on map
    const map = window._3dstreetsMap
    if (map && stop.lat != null && stop.lng != null) {
      map.flyTo({ center: [stop.lng, stop.lat], zoom: 15, pitch: 50, duration: 900 })
    }
  }

  function handleRemove(stop) {
    if (stop.isFinal) return
    setConfirmRemoveId(stop.id)
  }

  function confirmRemove(stop) {
    removeWaypoint(stop.id)
    setConfirmRemoveId(null)
    if (selectedStop?.id === stop.id) setSelectedStop(null)
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setShowRouteStops(false)}
      />

      {/* Panel */}
      <motion.div
        className={styles.panel}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 40 }}
      >
        {/* Handle */}
        <div className={styles.handle} />

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.title}>Route Stops</div>
            <div className={styles.subtitle}>
              {waypoints.length} stop{waypoints.length !== 1 ? 's' : ''} · {destination?.name ?? 'Destination'}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={() => setShowRouteStops(false)}>✕</button>
        </div>

        {/* Trip stats */}
        <div className={styles.tripStats}>
          <div className={styles.stat}>
            <div className={styles.statValue}>{remainingDist}</div>
            <div className={styles.statLabel}>TOTAL DIST</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <div className={styles.statValue}>{eta}</div>
            <div className={styles.statLabel}>ETA</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <div className={styles.statValue}>{stops.length}</div>
            <div className={styles.statLabel}>STOPS</div>
          </div>
        </div>

        {/* Stop list */}
        <div className={styles.stopList}>
          {stops.length === 0 && (
            <div className={styles.emptyState}>No stops added yet</div>
          )}
          {stops.map((stop, index) => (
            <div key={stop.id ?? index}>
              <motion.button
                className={`${styles.stopRow} ${selectedStop?.id === stop.id ? styles.selected : ''}`}
                onClick={() => handleStopClick(stop)}
                whileTap={{ scale: 0.98 }}
              >
                {/* Connector line */}
                {index < stops.length - 1 && (
                  <div className={styles.connector} />
                )}

                {/* Number badge */}
                <div className={`${styles.badge} ${stop.isFinal ? styles.badgeFinal : ''}`}>
                  <span className={styles.badgeIcon}>{getStopIcon(stop)}</span>
                </div>

                {/* Info */}
                <div className={styles.stopInfo}>
                  <div className={styles.stopName}>{stop.name ?? `Stop ${stop.index}`}</div>
                  {stop.address && stop.address !== stop.name && (
                    <div className={styles.stopAddr}>{stop.address}</div>
                  )}
                  {stop.isFinal && (
                    <div className={styles.finalBadge}>DESTINATION</div>
                  )}
                </div>

                {/* Actions */}
                <div className={styles.stopActions}>
                  {!stop.isFinal && (
                    <button
                      className={styles.removeBtn}
                      onClick={e => { e.stopPropagation(); handleRemove(stop) }}
                      aria-label="Remove stop"
                    >
                      🗑
                    </button>
                  )}
                  <span className={styles.chevron}>›</span>
                </div>
              </motion.button>

              {/* Confirm removal dialog */}
              <AnimatePresence>
                {confirmRemoveId === stop.id && (
                  <motion.div
                    className={styles.confirmRow}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span className={styles.confirmText}>Remove this stop?</span>
                    <button className={styles.confirmYes} onClick={() => confirmRemove(stop)}>Remove</button>
                    <button className={styles.confirmNo} onClick={() => setConfirmRemoveId(null)}>Cancel</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  )
}
