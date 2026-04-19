import { motion } from 'framer-motion'
import useStore from '../../store/appStore'
import styles from './CarHoodOverlay.module.css'

export default function CarHoodOverlay() {
  const speedMPH = useStore(s => s.speedMPH)
  const drivingView = useStore(s => s.drivingView)
  const toggleDrivingView = useStore(s => s.toggleDrivingView)

  if (!drivingView) return null

  return (
    <motion.div
      className={styles.overlay}
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Car hood shape */}
      <svg
        className={styles.hood}
        viewBox="0 0 400 120"
        preserveAspectRatio="xMidYMax slice"
      >
        {/* Main hood surface */}
        <defs>
          <linearGradient id="hoodGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1a1f2e" />
            <stop offset="50%" stopColor="#0d1117" />
            <stop offset="100%" stopColor="#060810" />
          </linearGradient>
          <linearGradient id="hoodHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id="hoodShadow" x="-10%" y="-20%" width="120%" height="140%">
            <feDropShadow dx="0" dy="-4" stdDeviation="8" floodColor="rgba(0,0,0,0.6)" />
          </filter>
        </defs>

        {/* Hood outline - curved sports car style */}
        <path
          d="M 0 120 
             L 0 70 
             Q 20 50, 60 40 
             Q 100 30, 140 28 
             L 160 25 
             Q 200 20, 240 25 
             L 260 28 
             Q 300 30, 340 40 
             Q 380 50, 400 70 
             L 400 120 
             Z"
          fill="url(#hoodGradient)"
          filter="url(#hoodShadow)"
        />

        {/* Hood center ridge */}
        <path
          d="M 180 30 Q 200 22, 220 30 L 220 120 L 180 120 Z"
          fill="rgba(255,255,255,0.03)"
        />

        {/* Left side highlight */}
        <path
          d="M 30 65 Q 80 45, 150 35 L 150 40 Q 80 50, 30 70 Z"
          fill="url(#hoodHighlight)"
        />

        {/* Right side highlight */}
        <path
          d="M 370 65 Q 320 45, 250 35 L 250 40 Q 320 50, 370 70 Z"
          fill="url(#hoodHighlight)"
        />

        {/* Hood edge line */}
        <path
          d="M 60 40 Q 100 30, 140 28 L 160 25 Q 200 20, 240 25 L 260 28 Q 300 30, 340 40"
          fill="none"
          stroke="rgba(0,212,255,0.15)"
          strokeWidth="1"
        />

        {/* Side vents (left) */}
        <g opacity="0.6">
          <rect x="70" y="55" width="30" height="3" rx="1.5" fill="#0a0c12" />
          <rect x="75" y="62" width="25" height="3" rx="1.5" fill="#0a0c12" />
          <rect x="80" y="69" width="20" height="3" rx="1.5" fill="#0a0c12" />
        </g>

        {/* Side vents (right) */}
        <g opacity="0.6">
          <rect x="300" y="55" width="30" height="3" rx="1.5" fill="#0a0c12" />
          <rect x="300" y="62" width="25" height="3" rx="1.5" fill="#0a0c12" />
          <rect x="300" y="69" width="20" height="3" rx="1.5" fill="#0a0c12" />
        </g>
      </svg>

      {/* Dashboard elements */}
      <div className={styles.dashboard}>
        {/* Speedometer indicator (small) */}
        <div className={styles.speedIndicator}>
          <span className={styles.speedValue}>{Math.round(speedMPH)}</span>
          <span className={styles.speedUnit}>MPH</span>
        </div>

        {/* Toggle view button */}
        <button 
          className={styles.viewToggle}
          onClick={toggleDrivingView}
          aria-label="Switch to bird's eye view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2" />
            <path d="M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
          </svg>
        </button>
      </div>

      {/* Steering wheel hint at bottom center */}
      <div className={styles.steeringHint}>
        <svg width="40" height="20" viewBox="0 0 40 20" fill="none">
          <path
            d="M 5 18 Q 20 5, 35 18"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
    </motion.div>
  )
}
