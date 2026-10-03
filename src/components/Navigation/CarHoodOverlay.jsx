import { motion } from 'framer-motion'
import { useSteeringAngle } from '../../hooks/useSteeringAngle'
import useStore from '../../store/appStore'
import styles from './CarHoodOverlay.module.css'

// ── Forza-style 3-spoke steering wheel. Rotates with steering input. ─────
function SteeringWheel({ angle }) {
  return (
    <svg className={styles.wheelSvg} viewBox="0 0 140 140" aria-hidden="true">
      <g transform={`rotate(${angle.toFixed(1)} 70 70)`}>
        {/* Leather rim */}
        <circle cx="70" cy="70" r="61" fill="none" stroke="#14171e" strokeWidth="14" />
        <circle cx="70" cy="70" r="61" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="2.5"
          strokeDasharray="200 183" strokeLinecap="round" transform="rotate(-100 70 70)" />
        {/* 12-o'clock marker */}
        <rect x="66" y="2" width="8" height="10" rx="2" fill="#00d4ff" opacity="0.85" />
        {/* Spokes: bottom, left, right */}
        {[0, 90, 270].map(a => (
          <g key={a} transform={`rotate(${a} 70 70)`}>
            <rect x="63" y="66" width="14" height="50" rx="7" fill="#14171e" />
            <rect x="63" y="66" width="14" height="50" rx="7" fill="none"
              stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          </g>
        ))}
        {/* Hub */}
        <rect x="50" y="50" width="40" height="40" rx="11" fill="#1d212b"
          stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <circle cx="70" cy="70" r="9" fill="#0b2a4a" stroke="rgba(0,212,255,0.5)" strokeWidth="1.5" />
        <circle cx="70" cy="70" r="3" fill="#00d4ff" />
      </g>
    </svg>
  )
}

// ── Forza-style gauge cluster: tach arc with redline, live needle,
//    digital speed + gear. ────────────────────────────────────────────────
function Tachometer({ speedMPH }) {
  const cx = 110, cy = 112, r = 82, maxV = 120
  const a0 = -120, a1 = 120
  const pt = (deg, rad) => {
    const a = (deg * Math.PI) / 180
    return [cx + rad * Math.sin(a), cy - rad * Math.cos(a)]
  }
  const arc = (from, to, rad) => {
    const [x0, y0] = pt(from, rad)
    const [x1, y1] = pt(to, rad)
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${rad} ${rad} 0 1 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  const ticks = []
  for (let v = 0; v <= maxV; v += 10) {
    const deg = a0 + (v / maxV) * (a1 - a0)
    const major = v % 20 === 0
    const [x0, y0] = pt(deg, r - (major ? 13 : 7))
    const [x1, y1] = pt(deg, r)
    ticks.push(
      <line key={v} x1={x0} y1={y0} x2={x1} y2={y1}
        stroke={v >= 100 ? '#ff2a1a' : 'rgba(255,255,255,0.5)'}
        strokeWidth={major ? 2.5 : 1.5} />
    )
    if (v % 40 === 0) {
      const [tx, ty] = pt(deg, r - 25)
      ticks.push(
        <text key={`l${v}`} x={tx} y={ty} textAnchor="middle" dominantBaseline="central"
          fill="rgba(255,255,255,0.62)" fontSize="12"
          fontFamily="'Barlow Condensed', sans-serif" fontWeight="700">{v}</text>
      )
    }
  }
  const clamped = Math.min(Math.max(speedMPH || 0, 0), maxV)
  const nDeg = a0 + (clamped / maxV) * (a1 - a0)
  const [nx, ny] = pt(nDeg, r - 16)

  return (
    <svg className={styles.tachSvg} viewBox="0 0 220 132" aria-hidden="true">
      {/* Dial arcs */}
      <path d={arc(a0, a1, r)} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="9" strokeLinecap="round" />
      <path d={arc(84, 120, r)} fill="none" stroke="#ff2a1a" strokeWidth="9" strokeLinecap="round" opacity="0.9" />
      {ticks}
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#ff3b30" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="7" fill="#1d212b" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      {/* Digital readout */}
      <text x={cx} y={cy - 34} textAnchor="middle" fill="#ffffff"
        fontSize="34" fontWeight="800" fontFamily="'Barlow Condensed', sans-serif"
        style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(speedMPH || 0)}
      </text>
      <text x={cx} y={cy - 18} textAnchor="middle" fill="rgba(255,255,255,0.5)"
        fontSize="10" fontFamily="'Barlow Condensed', sans-serif" letterSpacing="2">MPH</text>
      {/* Gear indicator */}
      <rect x={cx - 13} y={cy + 8} width="26" height="20" rx="5" fill="rgba(0,212,255,0.12)"
        stroke="rgba(0,212,255,0.45)" strokeWidth="1" />
      <text x={cx} y={cy + 23} textAnchor="middle" fill="#7fe7ff" fontSize="14" fontWeight="800"
        fontFamily="'Barlow Condensed', sans-serif">D</text>
    </svg>
  )
}

export default function CarHoodOverlay() {
  const speedMPH       = useStore(s => s.speedMPH)
  const drivingView    = useStore(s => s.drivingView)
  const driveCam       = useStore(s => s.driveCam)
  const toggleDrivingView = useStore(s => s.toggleDrivingView)

  // Steering angle from heading deltas — smoothed, clamped like a wheel.
  const steering = useSteeringAngle()

  // Hood/cockpit overlay only renders in those camera modes —
  // chase cam shows the 3D vehicle instead.
  if (!drivingView || driveCam === 'chase') return null
  const hoodOnly = driveCam === 'hood'

  return (
    <motion.div
      className={styles.overlay}
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
    >
      <div className={styles.windshieldVignette} />
      <div className={styles.windshieldPillarLeft} />
      <div className={styles.windshieldPillarRight} />
      <div className={styles.windshieldGlare} />
      <div className={styles.rearViewStrip} />

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

      {/* ── Forza-style dashboard: wheel + working gauges ── */}
      <div className={styles.dashboard}>
        <div className={styles.cluster}>
          {!hoodOnly && <SteeringWheel angle={steering} />}
          <div className={styles.gaugeCluster}>
            <Tachometer speedMPH={speedMPH} />
          </div>
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
