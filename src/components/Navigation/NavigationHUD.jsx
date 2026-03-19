import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useStore from '../../store/appStore'
import styles from './NavigationHUD.module.css'

// Maneuver type → icon mapping
const MANEUVER_ICONS = {
  'turn-left':         '↰',
  'turn-right':        '↱',
  'turn-slight-left':  '↖',
  'turn-slight-right': '↗',
  'turn-sharp-left':   '⬐',
  'turn-sharp-right':  '⬏',
  'uturn':             '↩',
  'roundabout':        '↻',
  'merge':             '⤵',
  'off-ramp-left':     '⬐',
  'off-ramp-right':    '⬏',
  'arrive':            '📍',
  'depart':            '🚀',
  'straight':          '↑',
  'default':           '↑',
}

function getManeuverIcon(type, modifier) {
  if (!type) return '↑'
  const key = modifier ? `${type}-${modifier}`.replace(/ /g, '-') : type
  return MANEUVER_ICONS[key] ?? MANEUVER_ICONS[type] ?? '↑'
}

function speedState(mph, limit) {
  if (mph > limit + 10) return 'danger'
  if (mph > limit)      return 'warning'
  return 'normal'
}

export default function NavigationHUD() {
  const endNavigation     = useStore(s => s.endNavigation)
  const routeSteps        = useStore(s => s.routeSteps)
  const currentStepIndex  = useStore(s => s.currentStepIndex)
  const eta               = useStore(s => s.eta)
  const remainingDist     = useStore(s => s.remainingDist)
  const speedMPH          = useStore(s => s.speedMPH)
  const speedLimit        = useStore(s => s.speedLimit)
  const showSpeedHUD      = useStore(s => s.showSpeedHUD)
  const openAI            = useStore(s => s.openAI)
  const setShowWaypoints  = useStore(s => s.setShowWaypoints)
  const rerouteAvailable  = useStore(s => s.rerouteAvailable)
  const rerouteTimeSave   = useStore(s => s.rerouteTimeSave)
  const setRerouteAvail   = useStore(s => s.setRerouteAvailable)
  const waypoints         = useStore(s => s.waypoints)
  const destination       = useStore(s => s.destination)
  const setShowRouteStops = useStore(s => s.setShowRouteStops)
  const setShowNavSidebar = useStore(s => s.setShowNavSidebar)

  const totalStops = waypoints.length + (destination ? 1 : 0)

  const step = routeSteps[currentStepIndex]
  const nextStep = routeSteps[currentStepIndex + 1]
  const state = speedState(speedMPH, speedLimit)

  return (
    <>
      {/* ── Top maneuver panel ────────────────────────────────────────── */}
      <motion.div
        className={styles.topPanel}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 350, damping: 35 }}
      >
        {/* Maneuver arrow */}
        <motion.div
          className={styles.arrowBox}
          key={step?.maneuver + step?.modifier}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <span className={styles.arrowIcon}>
            {getManeuverIcon(step?.maneuver, step?.modifier)}
          </span>
        </motion.div>

        {/* Distance + street */}
        <div className={styles.stepInfo}>
          <motion.div
            className={styles.stepDist}
            key={step?.distanceLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {step?.distanceLabel ?? '—'}
          </motion.div>
          <div className={styles.stepStreet}>
            {step?.bannerInstruction ?? step?.street ?? 'Continue'}
          </div>
          {nextStep && (
            <div className={styles.nextStep}>
              then {getManeuverIcon(nextStep.maneuver, nextStep.modifier)} {nextStep.street}
            </div>
          )}
        </div>

        {/* End nav */}
        <button className={styles.endBtn} onClick={endNavigation}>✕</button>

        {/* Sidebar toggle */}
        <button
          className={styles.sidebarBtn}
          onClick={() => setShowNavSidebar(true)}
          aria-label="Open navigation sidebar"
        >
          ☰
        </button>
      </motion.div>

      {/* ── Reroute banner ────────────────────────────────────────────── */}
      <AnimatePresence>
        {rerouteAvailable && (
          <motion.div
            className={styles.rerouteBanner}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
          >
            <div className={styles.rerouteLeft}>
              <div className={styles.rerouteDot} />
              <div>
                <div className={styles.rerouteTitle}>Faster route found</div>
                <div className={styles.rerouteSub}>Saves {rerouteTimeSave}</div>
              </div>
            </div>
            <div className={styles.rerouteActions}>
              <button className={styles.rerouteAccept} onClick={() => setRerouteAvail(false)}>Go</button>
              <button className={styles.rerouteDismiss} onClick={() => setRerouteAvail(false)}>Skip</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Speed HUD ─────────────────────────────────────────────────── */}
      {showSpeedHUD && (
        <motion.div
          className={`${styles.speedHUD} ${styles[state]}`}
          initial={{ x: -60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className={styles.speedNum}>{Math.round(speedMPH)}</div>
          <div className={styles.speedUnit}>MPH</div>
          <div className={styles.speedLimitBadge}>
            <span className={styles.speedLimitNum}>{speedLimit}</span>
          </div>
        </motion.div>
      )}

      {/* ── Bottom trip bar ────────────────────────────────────────────── */}
      <motion.div
        className={styles.bottomBar}
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 350, damping: 35, delay: 0.1 }}
      >
        <div className={styles.tripStat}>
          <div className={styles.tripValue}>{eta}</div>
          <div className={styles.tripLabel}>ARRIVAL</div>
        </div>

        <div className={styles.tripDivider} />

        <div className={styles.tripStat}>
          <div className={styles.tripValue}>{remainingDist}</div>
          <div className={styles.tripLabel}>REMAINING</div>
        </div>

        <div className={styles.tripDivider} />

        <button className={styles.tripAction} onClick={() => setShowRouteStops(true)}>
          <div className={styles.tripValue}>{totalStops}</div>
          <div className={styles.tripLabel}>STOPS</div>
        </button>

        <div className={styles.tripDivider} />

        {/* AI co-pilot quick access */}
        <button className={styles.aiQuickBtn} onClick={openAI}>
          <div className={styles.aiQuickOrb} />
          <div className={styles.tripLabel}>AI</div>
        </button>
      </motion.div>
    </>
  )
}
