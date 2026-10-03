import { motion, AnimatePresence } from 'framer-motion'
import { getManeuverIcon } from '../../utils/maneuvers'
import useStore from '../../store/appStore'
import styles from './NavigationSidebar.module.css'

export default function NavigationSidebar() {
  const setShowNavSidebar = useStore(s => s.setShowNavSidebar)
  const setShowRouteStops = useStore(s => s.setShowRouteStops)
  const getAllStops        = useStore(s => s.getAllStops)
  const setSelectedStop   = useStore(s => s.setSelectedStop)
  const selectedStop      = useStore(s => s.selectedStop)
  const routeSteps        = useStore(s => s.routeSteps)
  const currentStepIndex  = useStore(s => s.currentStepIndex)
  const eta               = useStore(s => s.eta)
  const remainingDist     = useStore(s => s.remainingDist)
  const waypoints         = useStore(s => s.waypoints)
  const destination       = useStore(s => s.destination)
  const openAI            = useStore(s => s.openAI)

  const stops = getAllStops()
  const currentStep = routeSteps[currentStepIndex]
  const totalStops = stops.length

  function handleStopClick(stop) {
    setSelectedStop(stop)
    const map = window._3dstreetsMap
    if (map && stop.lat != null && stop.lng != null) {
      map.flyTo({ center: [stop.lng, stop.lat], zoom: 15, pitch: 50, duration: 900 })
    }
    setShowNavSidebar(false)
  }

  return (
    <>
      {/* Backdrop (mobile only) */}
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setShowNavSidebar(false)}
      />

      {/* Sidebar */}
      <motion.div
        className={styles.sidebar}
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 42 }}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>Navigation</div>
          <button
            className={styles.closeBtn}
            onClick={() => setShowNavSidebar(false)}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* Route summary card */}
        <div className={styles.summaryCard}>
          <div className={styles.summaryRow}>
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{eta}</div>
              <div className={styles.summaryLabel}>ETA</div>
            </div>
            <div className={styles.summaryDivider} />
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{remainingDist}</div>
              <div className={styles.summaryLabel}>REMAINING</div>
            </div>
            <div className={styles.summaryDivider} />
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{totalStops}</div>
              <div className={styles.summaryLabel}>STOPS</div>
            </div>
          </div>
        </div>

        {/* Current step */}
        {currentStep && (
          <div className={styles.currentStep}>
            <div className={styles.currentStepIcon}>
              {getManeuverIcon(currentStep.maneuver, currentStep.modifier)}
            </div>
            <div className={styles.currentStepInfo}>
              <div className={styles.currentStepDist}>{currentStep.distanceLabel}</div>
              <div className={styles.currentStepStreet}>
                {currentStep.bannerInstruction ?? currentStep.street ?? 'Continue'}
              </div>
            </div>
          </div>
        )}

        {/* Scrollable content area */}
        <div className={styles.scrollArea}>
          {/* Directions section */}
          <div className={styles.sectionDivider} />
          <div className={styles.sectionLabel}>DIRECTIONS</div>
          <div className={styles.stepList}>
            {routeSteps.length === 0 ? (
              <div className={styles.emptyState}>No directions available</div>
            ) : (
              routeSteps.map((s, i) => (
                <div
                  key={i}
                  className={`${styles.dirStep} ${i === currentStepIndex ? styles.dirStepActive : ''} ${i < currentStepIndex ? styles.dirStepDone : ''}`}
                >
                  <div className={styles.dirIcon}>
                    {getManeuverIcon(s.maneuver, s.modifier)}
                  </div>
                  <div className={styles.dirText}>
                    <div className={styles.dirInstruction}>
                      {s.bannerInstruction ?? s.street ?? 'Continue'}
                    </div>
                    {s.distanceLabel && (
                      <div className={styles.dirDist}>{s.distanceLabel}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Stops section */}
          <div className={styles.sectionDivider} />
          <div className={styles.sectionLabel}>ROUTE STOPS</div>
          <div className={styles.stopList}>
            {stops.length === 0 ? (
              <div className={styles.emptyStops}>No stops added</div>
            ) : (
              stops.map((stop, index) => (
                <button
                  key={stop.id ?? index}
                  className={`${styles.stopItem} ${selectedStop?.id === stop.id ? styles.stopSelected : ''}`}
                  onClick={() => handleStopClick(stop)}
                >
                  <div className={`${styles.stopDot} ${stop.isFinal ? styles.stopDotFinal : ''}`}>
                    <span>{stop.isFinal ? '🏁' : stop.index}</span>
                  </div>
                  <div className={styles.stopText}>
                    <div className={styles.stopName}>{stop.name ?? `Stop ${stop.index}`}</div>
                    {stop.address && stop.address !== stop.name && (
                      <div className={styles.stopAddr}>{stop.address}</div>
                    )}
                  </div>
                  <span className={styles.stopChevron}>›</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* All stops button */}
        <button
          className={styles.allStopsBtn}
          onClick={() => { setShowNavSidebar(false); setShowRouteStops(true) }}
        >
          <span>📍</span>
          <span>View All Stops</span>
        </button>

        {/* AI co-pilot */}
        <button className={styles.aiBtn} onClick={() => { setShowNavSidebar(false); openAI() }}>
          <div className={styles.aiOrb} />
          <span>Open AI Co-Pilot</span>
        </button>
      </motion.div>
    </>
  )
}
