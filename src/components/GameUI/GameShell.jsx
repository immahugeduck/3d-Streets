import { useMemo } from 'react'
import { motion } from 'framer-motion'
import useStore, { PHASE } from '../../store/appStore'
import styles from './GameShell.module.css'

const VEHICLE_PROFILES = [
  { id: 'sport', label: 'Sport', wheel: 'wheelSport', dash: 'dashSport', tagline: 'Low cockpit, responsive view' },
  { id: 'truck', label: 'Truck', wheel: 'wheelTruck', dash: 'dashTruck', tagline: 'Tall hood, utility stance' },
  { id: 'suv', label: 'SUV', wheel: 'wheelSuv', dash: 'dashSuv', tagline: 'Balanced height, wide glass' },
  { id: 'van', label: 'Van', wheel: 'wheelVan', dash: 'dashVan', tagline: 'Open windshield, delivery view' },
  { id: 'minimal', label: 'Minimal', wheel: 'wheelMinimal', dash: 'dashMinimal', tagline: 'Clean dash, focused guidance' },
]

function getSteeringAngle(heading) {
  if (!Number.isFinite(heading)) return 0
  return Math.max(-14, Math.min(14, Math.sin((heading * Math.PI) / 90) * 10))
}

export default function GameShell() {
  const cockpitMode = useStore(s => s.cockpitMode)
  const setCockpitMode = useStore(s => s.setCockpitMode)
  const cockpitView = useStore(s => s.cockpitView)
  const phase = useStore(s => s.phase)
  const speedMPH = useStore(s => s.speedMPH)
  const eta = useStore(s => s.eta)
  const remainingDist = useStore(s => s.remainingDist)
  const routeSteps = useStore(s => s.routeSteps)
  const currentStepIndex = useStore(s => s.currentStepIndex)
  const userHeading = useStore(s => s.userHeading)
  const drivingView = useStore(s => s.drivingView)

  const profile = useMemo(
    () => VEHICLE_PROFILES.find(vehicle => vehicle.id === cockpitMode) ?? VEHICLE_PROFILES[0],
    [cockpitMode]
  )
  const activeStep = routeSteps[currentStepIndex]
  const navActive = phase === PHASE.NAVIGATING
  const steeringAngle = getSteeringAngle(userHeading)
  const isHoodOnly = cockpitView === 'hood'

  if (!drivingView) return null

  return (
    <motion.div
      className={`${styles.shell} ${styles[profile.dash]} ${navActive ? styles.navActive : styles.idleView} ${isHoodOnly ? styles.hoodOnly : styles.fullCockpit}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      aria-label="Premium driving cockpit interface"
    >
      <div className={styles.windshieldTint} />

      {!navActive && (
        <div className={styles.profileDock}>
          <span>Vehicle</span>
          <div className={styles.vehicleTabs} aria-label="Vehicle profile selector">
            {VEHICLE_PROFILES.map(mode => (
              <button
                key={mode.id}
                className={`${styles.vehicleTab} ${cockpitMode === mode.id ? styles.vehicleTabActive : ''}`}
                type="button"
                onClick={() => setCockpitMode(mode.id)}
                aria-pressed={cockpitMode === mode.id}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {navActive && <div className={styles.centerGuide}><span /></div>}

      <motion.div
        className={styles.cockpit}
        animate={{ y: isHoodOnly ? 116 : 0, opacity: isHoodOnly ? 0 : 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <div className={styles.dashSurface}>
          {navActive && (
            <div className={styles.instrumentCluster}>
              <span className={styles.metricLabel}>Speed</span>
              <strong>{Math.round(speedMPH || 0)}</strong>
              <small>MPH</small>
            </div>
          )}

          <motion.div
            className={`${styles.steeringWheel} ${styles[profile.wheel]}`}
            animate={{ rotate: steeringAngle }}
            transition={{ type: 'spring', stiffness: 150, damping: 18 }}
            aria-hidden="true"
          >
            <div className={styles.wheelHub} />
          </motion.div>

          {navActive && (
            <div className={styles.centerScreen}>
              <span className={styles.metricLabel}>Next instruction</span>
              <strong>{activeStep?.distanceLabel ?? '—'}</strong>
              <p>{activeStep?.instruction ?? 'Continue on current road'}</p>
            </div>
          )}
        </div>
      </motion.div>

      {navActive && (
        <div className={styles.bottomDock}>
          <div className={styles.speedPill}>
            <span>{Math.round(speedMPH || 0)}</span>
            <small>MPH</small>
          </div>
          <div className={styles.turnCard}>
            <span className={styles.metricLabel}>Miles to arrival</span>
            <strong>{remainingDist || '—'}</strong>
            <p>{activeStep?.instruction ?? 'Continue on current road'}</p>
          </div>
          <div className={styles.etaCard}>
            <span className={styles.metricLabel}>ETA</span>
            <strong>{eta || '--:--'}</strong>
          </div>
        </div>
      )}
    </motion.div>
  )
}
