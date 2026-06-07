import { motion, AnimatePresence } from 'framer-motion'
import useStore, { PHASE } from '../../store/appStore'
import { flyToUser } from '../Map/MapView'
import styles from './MapControls.module.css'

export default function MapControls() {
  const phase          = useStore(s => s.phase)
  const openAI         = useStore(s => s.openAI)
  const pinDropMode    = useStore(s => s.pinDropMode)
  const setPinDropMode = useStore(s => s.setPinDropMode)
  const setShowSettings = useStore(s => s.setShowSettings)

  if (phase === PHASE.NAVIGATING || phase === PHASE.SKETCHING) return null

  return (
    <div className={styles.rail}>
      {/* Locate me */}
      <button className={`${styles.btn} ${styles.accent}`} onClick={flyToUser} title="Go to my location">
        <LocateIcon />
      </button>

      {/* Pin drop — tap map to set destination */}
      <AnimatePresence>
        {pinDropMode && (
          <motion.div
            className={styles.pinHint}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
          >
            Tap map to pin
          </motion.div>
        )}
      </AnimatePresence>
      <button
        className={`${styles.btn} ${pinDropMode ? styles.active : ''}`}
        onClick={() => setPinDropMode(!pinDropMode)}
        title="Drop a destination pin"
      >
        <PinIcon />
      </button>

      {/* AI co-pilot */}
      <button className={`${styles.btn} ${styles.aiBtn}`} onClick={openAI} title="AI Co-pilot">
        <span className={styles.aiOrb} />
      </button>

      {/* Settings */}
      <button className={styles.btn} onClick={() => setShowSettings(true)} title="Settings">
        <GearIcon />
      </button>
    </div>
  )
}

const LocateIcon = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="9" strokeDasharray="3 3" opacity=".4"/></svg>
const PinIcon    = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10z"/><circle cx="12" cy="11" r="2.5"/></svg>
const GearIcon   = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
