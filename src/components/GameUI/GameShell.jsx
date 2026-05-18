import { motion } from 'framer-motion'
import useStore, { PHASE } from '../../store/appStore'
import styles from './GameShell.module.css'

const VEHICLE_MODES = [
  { id: 'sport', label: 'Sport', icon: '🏎️' },
  { id: 'truck', label: 'Truck', icon: '🛻' },
  { id: 'van', label: 'Van', icon: '🚐' },
]

export default function GameShell() {
  const phase = useStore(s => s.phase)
  const speedMPH = useStore(s => s.speedMPH)
  const speedLimit = useStore(s => s.speedLimit)
  const eta = useStore(s => s.eta)
  const remainingDist = useStore(s => s.remainingDist)
  const routeSteps = useStore(s => s.routeSteps)
  const currentStepIndex = useStore(s => s.currentStepIndex)
  const userHeading = useStore(s => s.userHeading)
  const drivingView = useStore(s => s.drivingView)

  const activeStep = routeSteps[currentStepIndex]
  const navActive = phase === PHASE.NAVIGATING
  const heading = Number.isFinite(userHeading) ? Math.round(userHeading) : 0

  if (!drivingView) return null

  return (
    <motion.div
      className={`${styles.shell} ${navActive ? styles.navActive : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      aria-label="Game style driving interface"
    >
      <div className={styles.scanlines} />
      <div className={styles.topBar}>
        <div className={styles.brandBlock}>
          <span className={styles.brandKicker}>3D STREETS</span>
          <strong>Drive Mode</strong>
        </div>
        <div className={styles.vehicleTabs}>
          {VEHICLE_MODES.map(mode => (
            <button key={mode.id} className={styles.vehicleTab} type="button">
              <span>{mode.icon}</span>
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.centerReticle}>
        <span />
      </div>

      <div className={styles.leftStack}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Heading</span>
          <strong>{heading}°</strong>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Limit</span>
          <strong>{speedLimit || '—'} MPH</strong>
        </div>
      </div>

      <div className={styles.rightStack}>
        <div className={styles.objectiveCard}>
          <span className={styles.metricLabel}>Objective</span>
          <strong>{navActive ? 'Arrive Safely' : 'Choose Route'}</strong>
          <small>{navActive ? `${remainingDist || '—'} remaining` : 'Search, preview, then launch'}</small>
        </div>
      </div>

      <div className={styles.bottomDock}>
        <div className={styles.speedRing}>
          <span>{Math.round(speedMPH || 0)}</span>
          <small>MPH</small>
        </div>
        <div className={styles.turnCard}>
          <span className={styles.metricLabel}>Next Move</span>
          <strong>{activeStep?.distanceLabel ?? 'Ready'}</strong>
          <p>{activeStep?.instruction ?? 'Start navigation to activate the full game HUD.'}</p>
        </div>
        <div className={styles.etaCard}>
          <span className={styles.metricLabel}>ETA</span>
          <strong>{eta || '--:--'}</strong>
        </div>
      </div>
    </motion.div>
  )
}
