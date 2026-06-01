import { motion, AnimatePresence } from 'framer-motion'
import useStore, { PHASE } from '../../store/appStore'
import styles from './VehicleEntryOverlay.module.css'

export default function VehicleEntryOverlay() {
  const phase = useStore(s => s.phase)
  const selectedRoute = useStore(s => s.selectedRoute)
  const drivingView = useStore(s => s.drivingView)

  const show = phase === PHASE.NAVIGATING && drivingView

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ delay: 2.1, duration: 0.8, ease: 'easeOut' }}
          aria-hidden="true"
        >
          <motion.div
            className={styles.card}
            initial={{ y: 34, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            <span>Route accepted</span>
            <strong>Entering vehicle</strong>
            <small>{selectedRoute?.durationLabel || 'Starting immersive drive'}</small>
          </motion.div>
          <motion.div
            className={styles.sweep}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: [0, 1, 0.45] }}
            transition={{ duration: 1.35, ease: 'easeInOut' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
