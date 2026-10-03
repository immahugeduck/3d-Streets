import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useSteeringAngle } from '../../hooks/useSteeringAngle'
import useStore, { PHASE } from '../../store/appStore'
import styles from './GameShell.module.css'

const VEHICLE_PROFILES = [
  { id: 'sport', label: 'Sport', wheel: 'wheelSport', dash: 'dashSport' },
  { id: 'truck', label: 'Truck', wheel: 'wheelTruck', dash: 'dashTruck' },
  { id: 'suv', label: 'SUV', wheel: 'wheelSuv', dash: 'dashSuv' },
  { id: 'van', label: 'Van', wheel: 'wheelVan', dash: 'dashVan' },
  { id: 'minimal', label: 'Minimal', wheel: 'wheelMinimal', dash: 'dashMinimal' },
]

// Idle map shell — ambient cockpit framing behind the map UI.
// During navigation this renders nothing: the Forza overlays own the
// screen (3D chase vehicle, CarHoodOverlay dash, NavigationHUD).
export default function GameShell() {
  const cockpitMode = useStore(s => s.cockpitMode)
  const phase = useStore(s => s.phase)
  const drivingView = useStore(s => s.drivingView)
  const steeringAngle = useSteeringAngle()

  const profile = useMemo(
    () => VEHICLE_PROFILES.find(vehicle => vehicle.id === cockpitMode) ?? VEHICLE_PROFILES[0],
    [cockpitMode]
  )
  const navActive = phase === PHASE.NAVIGATING

  if (!drivingView || navActive) return null

  return (
    <motion.div
      className={`${styles.shell} ${styles[profile.dash]} ${styles.idleView}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      aria-label="Premium driving cockpit interface"
    >
      <div className={styles.windshieldTint} />

      <motion.div
        className={styles.cockpit}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <div className={styles.dashSurface}>
          <motion.div
            className={`${styles.steeringWheel} ${styles[profile.wheel]}`}
            animate={{ rotate: steeringAngle }}
            transition={{ type: 'spring', stiffness: 150, damping: 18 }}
            aria-hidden="true"
          >
            <div className={styles.wheelHub} />
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  )
}
