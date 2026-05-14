import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import useStore from '../../store/appStore'
import styles from './CarHoodOverlay.module.css'

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function estimateGear(mph) {
  if (mph < 2)  return 'N'
  if (mph < 15) return '1'
  if (mph < 30) return '2'
  if (mph < 45) return '3'
  if (mph < 60) return '4'
  if (mph < 80) return '5'
  return '6'
}

// Approximate RPM 0-1 within current gear (for the rev arc)
function estimateRpmFraction(mph) {
  const breakpoints = [0, 15, 30, 45, 60, 80, 110]
  for (let i = 0; i < breakpoints.length - 1; i++) {
    if (mph < breakpoints[i + 1]) {
      return (mph - breakpoints[i]) / (breakpoints[i + 1] - breakpoints[i])
    }
  }
  return 1
}

// ── Steering wheel SVG ────────────────────────────────────────────────────
function SteeringWheel({ deg }) {
  return (
    <svg
      className={styles.wheelSvg}
      viewBox="0 0 240 240"
      style={{ transform: `rotate(${deg}deg)`, transition: 'transform 0.12s ease-out' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="hubGrad" cx="42%" cy="35%" r="60%">
          <stop offset="0%"   stopColor="#1a2035" />
          <stop offset="100%" stopColor="#080c18" />
        </radialGradient>
        <radialGradient id="rimGrad" cx="30%" cy="25%" r="70%">
          <stop offset="0%"   stopColor="#1e2540" />
          <stop offset="100%" stopColor="#080c18" />
        </radialGradient>
        <filter id="wheelGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* ── Outer glow ring ── */}
      <circle cx="120" cy="120" r="106" fill="none"
        stroke="rgba(0,212,255,0.06)" strokeWidth="28" />

      {/* ── Rim body (D-shaped: full arc + flat bottom) ── */}
      {/* Main rim fill */}
      <path
        d="M 58,204 A 102,102 0 1,1 182,204 L 58,204 Z"
        fill="url(#rimGrad)"
      />
      {/* Rim outer border */}
      <path
        d="M 58,204 A 102,102 0 1,1 182,204"
        fill="none" stroke="#0d1120" strokeWidth="24" strokeLinecap="round"
      />
      <line x1="58" y1="204" x2="182" y2="204"
        stroke="#0d1120" strokeWidth="24" strokeLinecap="round" />

      {/* Rim surface highlight */}
      <path
        d="M 58,204 A 102,102 0 1,1 182,204"
        fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="10" strokeLinecap="round"
      />
      {/* Rim inner edge (cyan accent line) */}
      <path
        d="M 64,200 A 90,90 0 1,1 176,200"
        fill="none" stroke="rgba(0,212,255,0.18)" strokeWidth="1.5" strokeLinecap="round"
      />
      <line x1="64" y1="200" x2="176" y2="200"
        stroke="rgba(0,212,255,0.18)" strokeWidth="1.5" strokeLinecap="round" />

      {/* Grip texture marks at 9/3 o'clock (thumb rests) */}
      {[0, 6, 12].map(i => (
        <line key={`l${i}`}
          x1={18 + i * 1.5} y1={116 + i * 2}
          x2={20 + i * 1.5} y2={108 + i * 2}
          stroke="rgba(0,212,255,0.12)" strokeWidth="3" strokeLinecap="round"
        />
      ))}
      {[0, 6, 12].map(i => (
        <line key={`r${i}`}
          x1={222 - i * 1.5} y1={116 + i * 2}
          x2={220 - i * 1.5} y2={108 + i * 2}
          stroke="rgba(0,212,255,0.12)" strokeWidth="3" strokeLinecap="round"
        />
      ))}

      {/* ── Spokes (Y-layout: upper-left, upper-right, bottom-center) ── */}
      {/* Left spoke — dark body */}
      <line x1="120" y1="120" x2="34" y2="60"
        stroke="#0a0e1a" strokeWidth="20" strokeLinecap="round" />
      {/* Left spoke — cyan accent */}
      <line x1="120" y1="120" x2="34" y2="60"
        stroke="rgba(0,212,255,0.25)" strokeWidth="2" strokeLinecap="round" />

      {/* Right spoke — dark body */}
      <line x1="120" y1="120" x2="206" y2="60"
        stroke="#0a0e1a" strokeWidth="20" strokeLinecap="round" />
      {/* Right spoke — cyan accent */}
      <line x1="120" y1="120" x2="206" y2="60"
        stroke="rgba(0,212,255,0.25)" strokeWidth="2" strokeLinecap="round" />

      {/* Bottom spoke — dark body */}
      <line x1="120" y1="120" x2="120" y2="216"
        stroke="#0a0e1a" strokeWidth="20" strokeLinecap="round" />
      {/* Bottom spoke — cyan accent */}
      <line x1="120" y1="120" x2="120" y2="216"
        stroke="rgba(0,212,255,0.25)" strokeWidth="2" strokeLinecap="round" />

      {/* ── Center hub ── */}
      <circle cx="120" cy="120" r="34"
        fill="url(#hubGrad)"
        stroke="rgba(0,212,255,0.3)" strokeWidth="1.5" />
      {/* Hub inner ring */}
      <circle cx="120" cy="120" r="24"
        fill="none" stroke="rgba(0,212,255,0.12)" strokeWidth="1" />
      {/* Hub surface sheen */}
      <ellipse cx="114" cy="112" rx="10" ry="6"
        fill="rgba(255,255,255,0.04)" />
      {/* Center glow dot */}
      <circle cx="120" cy="120" r="9"
        fill="#00d4ff" opacity="0.9" filter="url(#wheelGlow)" />
      <circle cx="120" cy="120" r="5"
        fill="white" opacity="0.95" />
    </svg>
  )
}

// ── Rev arc (simulated RPM indicator) ────────────────────────────────────
function RevArc({ fraction }) {
  // Arc from 135° to 405° (270° sweep), same as a real tacho
  const R = 54
  const CX = 60, CY = 60
  const startAngle = 135 * (Math.PI / 180)
  const sweepAngle = 270 * (Math.PI / 180)
  const endAngle = startAngle + sweepAngle * Math.min(fraction, 1)

  function arcPath(from, to, r) {
    const x1 = CX + r * Math.cos(from)
    const y1 = CY + r * Math.sin(from)
    const x2 = CX + r * Math.cos(to)
    const y2 = CY + r * Math.sin(to)
    const large = (to - from) > Math.PI ? 1 : 0
    return `M ${x1},${y1} A ${r},${r} 0 ${large},1 ${x2},${y2}`
  }

  // Color: blue → yellow → red as RPM rises
  const color = fraction < 0.65 ? '#0099FF'
    : fraction < 0.85 ? '#FFB800'
    : '#FF3B30'

  return (
    <svg viewBox="0 0 120 120" className={styles.revArc}>
      {/* Background track */}
      <path
        d={arcPath(startAngle, startAngle + sweepAngle, R)}
        fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Active fill */}
      {fraction > 0.01 && (
        <path
          d={arcPath(startAngle, endAngle, R)}
          fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
        />
      )}
      {/* Redline zone marker */}
      <path
        d={arcPath(startAngle + sweepAngle * 0.85, startAngle + sweepAngle, R)}
        fill="none" stroke="rgba(255,59,48,0.25)" strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function CarHoodOverlay() {
  const speedMPH          = useStore(s => s.speedMPH)
  const drivingView       = useStore(s => s.drivingView)
  const toggleDrivingView = useStore(s => s.toggleDrivingView)
  const userHeading       = useStore(s => s.userHeading)

  const [wheelDeg, setWheelDeg] = useState(0)
  const wheelRef     = useRef(0)
  const prevHeading  = useRef(null)

  // Accumulate heading changes → steering angle
  useEffect(() => {
    if (userHeading == null) return
    if (prevHeading.current == null) {
      prevHeading.current = userHeading
      return
    }
    let delta = userHeading - prevHeading.current
    if (delta > 180)  delta -= 360
    if (delta < -180) delta += 360
    prevHeading.current = userHeading

    wheelRef.current = clamp(wheelRef.current + delta * 6, -270, 270)
    setWheelDeg(wheelRef.current)
  }, [userHeading])

  // Spring decay back to center when driving straight
  useEffect(() => {
    if (!drivingView) return
    const id = setInterval(() => {
      if (Math.abs(wheelRef.current) > 0.4) {
        wheelRef.current *= 0.88
        setWheelDeg(wheelRef.current)
      }
    }, 50)
    return () => clearInterval(id)
  }, [drivingView])

  if (!drivingView) return null

  const gear    = estimateGear(speedMPH)
  const rpmFrac = estimateRpmFraction(speedMPH)

  return (
    <motion.div
      className={styles.overlay}
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
    >
      {/* ── Hood body SVG ─────────────────────────────────────────── */}
      <svg
        className={styles.hood}
        viewBox="0 0 800 240"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="hoodBody" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%"   stopColor="#070b16" />
            <stop offset="45%"  stopColor="#0c1120" />
            <stop offset="100%" stopColor="#141b2e" />
          </linearGradient>
          <linearGradient id="hoodShine" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.10)" />
            <stop offset="50%"  stopColor="rgba(255,255,255,0.03)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <radialGradient id="hoodAmbient" cx="50%" cy="110%" r="70%">
            <stop offset="0%"   stopColor="rgba(0,153,255,0.08)" />
            <stop offset="100%" stopColor="rgba(0,153,255,0)" />
          </radialGradient>
          <radialGradient id="noseTipGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgba(0,153,255,0.9)" />
            <stop offset="40%"  stopColor="rgba(0,153,255,0.4)" />
            <stop offset="100%" stopColor="rgba(0,153,255,0)" />
          </radialGradient>
          <linearGradient id="spineGlow" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%"   stopColor="rgba(0,153,255,0.5)" />
            <stop offset="60%"  stopColor="rgba(0,153,255,0.08)" />
            <stop offset="100%" stopColor="rgba(0,153,255,0)" />
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

        {/* Hood body */}
        <path
          d="M -10 240 L -10 150 Q 20 100, 80 72 Q 180 46, 320 34 L 370 28 Q 400 23, 430 28 L 480 34 Q 620 46, 720 72 Q 780 100, 810 150 L 810 240 Z"
          fill="url(#hoodBody)" filter="url(#hoodDrop)"
        />
        <path
          d="M -10 240 L -10 150 Q 20 100, 80 72 Q 180 46, 320 34 L 370 28 Q 400 23, 430 28 L 480 34 Q 620 46, 720 72 Q 780 100, 810 150 L 810 240 Z"
          fill="url(#hoodShine)"
        />
        <path
          d="M -10 240 L -10 150 Q 20 100, 80 72 Q 180 46, 320 34 L 370 28 Q 400 23, 430 28 L 480 34 Q 620 46, 720 72 Q 780 100, 810 150 L 810 240 Z"
          fill="url(#hoodAmbient)"
        />

        {/* Panel highlights */}
        <path d="M 10 165 Q 100 118, 270 76 L 278 88 Q 108 130, 18 178 Z"
          fill="rgba(255,255,255,0.05)" />
        <path d="M 790 165 Q 700 118, 530 76 L 522 88 Q 692 130, 782 178 Z"
          fill="rgba(255,255,255,0.05)" />

        {/* Left intake vents */}
        <g opacity="0.5" transform="translate(130, 100)">
          <rect x="0"  y="0"  width="52" height="4.5" rx="2.25" fill="#04060d" />
          <rect x="5"  y="11" width="44" height="4.5" rx="2.25" fill="#04060d" />
          <rect x="12" y="22" width="34" height="4.5" rx="2.25" fill="#04060d" />
          <rect x="0"  y="0"  width="52" height="4.5" rx="2.25" fill="none" stroke="rgba(0,153,255,0.15)" strokeWidth="0.5" />
          <rect x="5"  y="11" width="44" height="4.5" rx="2.25" fill="none" stroke="rgba(0,153,255,0.15)" strokeWidth="0.5" />
          <rect x="12" y="22" width="34" height="4.5" rx="2.25" fill="none" stroke="rgba(0,153,255,0.15)" strokeWidth="0.5" />
        </g>

        {/* Right intake vents */}
        <g opacity="0.5" transform="translate(618, 100)">
          <rect x="0"  y="0"  width="52" height="4.5" rx="2.25" fill="#04060d" />
          <rect x="3"  y="11" width="44" height="4.5" rx="2.25" fill="#04060d" />
          <rect x="6"  y="22" width="34" height="4.5" rx="2.25" fill="#04060d" />
          <rect x="0"  y="0"  width="52" height="4.5" rx="2.25" fill="none" stroke="rgba(0,153,255,0.15)" strokeWidth="0.5" />
          <rect x="3"  y="11" width="44" height="4.5" rx="2.25" fill="none" stroke="rgba(0,153,255,0.15)" strokeWidth="0.5" />
          <rect x="6"  y="22" width="34" height="4.5" rx="2.25" fill="none" stroke="rgba(0,153,255,0.15)" strokeWidth="0.5" />
        </g>

        {/* Center spine */}
        <path d="M 378 28 Q 400 21, 422 28 L 444 240 L 356 240 Z"
          fill="rgba(255,255,255,0.025)" />
        <path d="M 400 23 L 368 240 L 432 240 Z"
          fill="url(#spineGlow)" filter="url(#spineFilter)" opacity="0.55" />
        <line x1="400" y1="23" x2="363" y2="240"
          stroke="rgba(0,153,255,0.18)" strokeWidth="1" />
        <line x1="400" y1="23" x2="437" y2="240"
          stroke="rgba(0,153,255,0.18)" strokeWidth="1" />

        {/* Hood leading edge */}
        <path d="M 220 48 Q 340 30, 400 23 Q 460 30, 580 48"
          fill="none" stroke="rgba(0,153,255,0.35)"
          strokeWidth="1.5" strokeLinecap="round" />

        {/* Nose-tip location indicator */}
        <circle cx="400" cy="23" r="38" fill="url(#noseTipGlow)" />
        <circle cx="400" cy="23" r="14" fill="rgba(0,153,255,0.15)" filter="url(#noseTipFilter)">
          <animate attributeName="r"       values="12;22;12" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="400" cy="23" r="6" fill="#0099FF" filter="url(#noseTipFilter)" opacity="0.95" />
        <circle cx="400" cy="23" r="3" fill="white" opacity="0.9" />
      </svg>

      {/* ── Steering wheel (center, above hood) ─────────────────────── */}
      <div className={styles.wheelWrap}>
        <SteeringWheel deg={wheelDeg} />
      </div>

      {/* ── Dashboard overlay ────────────────────────────────────────── */}
      <div className={styles.dashboard}>

        {/* Left — speed block + rev arc */}
        <div className={styles.leftCluster}>
          <RevArc fraction={rpmFrac} />
          <div className={styles.speedBlock}>
            <div className={styles.gearBadge}>{gear}</div>
            <div className={styles.speedCol}>
              <span className={styles.speedValue}>{Math.round(speedMPH)}</span>
              <span className={styles.speedUnit}>MPH</span>
            </div>
          </div>
        </div>

        {/* Right — view toggle */}
        <button
          className={styles.viewToggle}
          onClick={toggleDrivingView}
          aria-label="Switch to bird's eye view"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          </svg>
        </button>
      </div>
    </motion.div>
  )
}
