import { motion } from 'framer-motion'
import useStore from '../../store/appStore'
import styles from './CarHoodOverlay.module.css'

export default function CarHoodOverlay() {
  const speedMPH       = useStore(s => s.speedMPH)
  const drivingView    = useStore(s => s.drivingView)
  const toggleDrivingView = useStore(s => s.toggleDrivingView)

  if (!drivingView) return null

  return (
    <motion.div
      className={styles.overlay}
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
    >
      <svg
        className={styles.hood}
        viewBox="0 0 800 240"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Main body gradient — dark steel finish */}
          <linearGradient id="hoodBody" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%"   stopColor="#080c18" />
            <stop offset="45%"  stopColor="#0d1220" />
            <stop offset="100%" stopColor="#161d2e" />
          </linearGradient>

          {/* Paint specular highlight */}
          <linearGradient id="hoodShine" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.10)" />
            <stop offset="50%"  stopColor="rgba(255,255,255,0.03)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* Ambient cyan under-glow from engine/road */}
          <radialGradient id="hoodAmbient" cx="50%" cy="110%" r="70%">
            <stop offset="0%"   stopColor="rgba(0,212,255,0.08)" />
            <stop offset="100%" stopColor="rgba(0,212,255,0)" />
          </radialGradient>

          {/* Nose-tip glow (location indicator) */}
          <radialGradient id="noseTipGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgba(0,212,255,0.9)" />
            <stop offset="40%"  stopColor="rgba(0,212,255,0.4)" />
            <stop offset="100%" stopColor="rgba(0,212,255,0)" />
          </radialGradient>

          {/* Spine glow gradient */}
          <linearGradient id="spineGlow" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%"   stopColor="rgba(0,212,255,0.5)" />
            <stop offset="60%"  stopColor="rgba(0,212,255,0.08)" />
            <stop offset="100%" stopColor="rgba(0,212,255,0)" />
          </linearGradient>

          <filter id="hoodDrop" x="-5%" y="-40%" width="110%" height="180%">
            <feDropShadow dx="0" dy="-10" stdDeviation="14" floodColor="rgba(0,0,0,0.9)" />
          </filter>
          <filter id="noseTipFilter" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="spineFilter" x="-100%" y="-10%" width="300%" height="120%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* ── Main hood body ────────────────────────────────────────── */}
        <path
          d="M -10 240
             L -10 150
             Q 20  100, 80  72
             Q 180  46, 320  34
             L 370  28
             Q 400  23, 430  28
             L 480  34
             Q 620  46, 720  72
             Q 780 100, 810 150
             L 810 240
             Z"
          fill="url(#hoodBody)"
          filter="url(#hoodDrop)"
        />

        {/* Paint shine */}
        <path
          d="M -10 240 L -10 150 Q 20 100, 80 72 Q 180 46, 320 34 L 370 28 Q 400 23, 430 28 L 480 34 Q 620 46, 720 72 Q 780 100, 810 150 L 810 240 Z"
          fill="url(#hoodShine)"
        />

        {/* Ambient under-glow */}
        <path
          d="M -10 240 L -10 150 Q 20 100, 80 72 Q 180 46, 320 34 L 370 28 Q 400 23, 430 28 L 480 34 Q 620 46, 720 72 Q 780 100, 810 150 L 810 240 Z"
          fill="url(#hoodAmbient)"
        />

        {/* ── Left panel highlight ── */}
        <path
          d="M 10 165 Q 100 118, 270 76 L 278 88 Q 108 130, 18 178 Z"
          fill="rgba(255,255,255,0.06)"
        />

        {/* ── Right panel highlight ── */}
        <path
          d="M 790 165 Q 700 118, 530 76 L 522 88 Q 692 130, 782 178 Z"
          fill="rgba(255,255,255,0.06)"
        />

        {/* ── Left intake vents ── */}
        <g opacity="0.55" transform="translate(130, 100)">
          <rect x="0"  y="0"  width="52" height="4.5" rx="2.25" fill="#05070e" />
          <rect x="5"  y="11" width="44" height="4.5" rx="2.25" fill="#05070e" />
          <rect x="12" y="22" width="34" height="4.5" rx="2.25" fill="#05070e" />
          <rect x="0"  y="0"  width="52" height="4.5" rx="2.25" fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="0.5" />
          <rect x="5"  y="11" width="44" height="4.5" rx="2.25" fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="0.5" />
          <rect x="12" y="22" width="34" height="4.5" rx="2.25" fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="0.5" />
        </g>

        {/* ── Right intake vents ── */}
        <g opacity="0.55" transform="translate(618, 100)">
          <rect x="0"  y="0"  width="52" height="4.5" rx="2.25" fill="#05070e" />
          <rect x="3"  y="11" width="44" height="4.5" rx="2.25" fill="#05070e" />
          <rect x="6"  y="22" width="34" height="4.5" rx="2.25" fill="#05070e" />
          <rect x="0"  y="0"  width="52" height="4.5" rx="2.25" fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="0.5" />
          <rect x="3"  y="11" width="44" height="4.5" rx="2.25" fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="0.5" />
          <rect x="6"  y="22" width="34" height="4.5" rx="2.25" fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="0.5" />
        </g>

        {/* ── Center spine body ── */}
        <path
          d="M 378 28 Q 400 21, 422 28 L 444 240 L 356 240 Z"
          fill="rgba(255,255,255,0.028)"
        />

        {/* ── Spine glow (blurred layer behind edge lines) ── */}
        <path
          d="M 400 23 L 368 240 L 432 240 Z"
          fill="url(#spineGlow)"
          filter="url(#spineFilter)"
          opacity="0.6"
        />

        {/* ── Spine edge lines ── */}
        <line x1="400" y1="23" x2="363" y2="240" stroke="rgba(0,212,255,0.18)" strokeWidth="1" />
        <line x1="400" y1="23" x2="437" y2="240" stroke="rgba(0,212,255,0.18)" strokeWidth="1" />

        {/* ── Hood leading edge accent ── */}
        <path
          d="M 220 48 Q 340 30, 400 23 Q 460 30, 580 48"
          fill="none"
          stroke="rgba(0,212,255,0.35)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* ── Nose-tip: location indicator ────────────────────────── */}
        {/* Outer halo */}
        <circle cx="400" cy="23" r="38" fill="url(#noseTipGlow)" />
        {/* Mid ring — animated pulse */}
        <circle cx="400" cy="23" r="14" fill="rgba(0,212,255,0.15)" filter="url(#noseTipFilter)">
          <animate attributeName="r"       values="12;22;12" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="2.2s" repeatCount="indefinite" />
        </circle>
        {/* Inner bright core */}
        <circle cx="400" cy="23" r="6" fill="#00D4FF" filter="url(#noseTipFilter)" opacity="0.95" />
        {/* Crisp center dot */}
        <circle cx="400" cy="23" r="3" fill="white" opacity="0.9" />
      </svg>

      {/* ── Dashboard overlay ── */}
      <div className={styles.dashboard}>
        <div className={styles.speedIndicator}>
          <span className={styles.speedValue}>{Math.round(speedMPH)}</span>
          <span className={styles.speedUnit}>MPH</span>
        </div>

        <button
          className={styles.viewToggle}
          onClick={toggleDrivingView}
          aria-label="Switch to bird's eye view"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          </svg>
        </button>
      </div>
    </motion.div>
  )
}
