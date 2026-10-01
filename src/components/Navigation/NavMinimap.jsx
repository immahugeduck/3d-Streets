import { useEffect, useRef, useState } from 'react'
import useStore from '../../store/appStore'
import styles from './NavMinimap.module.css'

// Forza Motorsport 6 corner minimap: perfect circle, dark translucent
// fill, thin white route ribbon, white heading-up triangle, orange dots
// for saved places (FM6's opponent dots). Flat — no glow, no pulse.
// Pure 2D canvas — cheap, fully styleable, no second map instance needed.
const AHEAD_M = 320       // meters of route shown ahead of the car
const BEHIND_M = 130      // meters shown behind

const MANEUVER_ICONS = {
  'turn-left': '↰', 'turn-right': '↱',
  'turn-slight-left': '↖', 'turn-slight-right': '↗',
  'turn-sharp-left': '⬐', 'turn-sharp-right': '⬏',
  uturn: '↩', roundabout: '↻', merge: '⤵', arrive: '◉', depart: '▲',
  straight: '↑', default: '↑',
}
function maneuverIcon(type, modifier) {
  if (!type) return '↑'
  const key = modifier ? `${type}-${modifier}`.replace(/ /g, '-') : type
  return MANEUVER_ICONS[key] ?? MANEUVER_ICONS[type] ?? '↑'
}

function toMeters(lng, lat, lng0, lat0, cosLat) {
  return [(lng - lng0) * 111320 * cosLat, (lat - lat0) * 111320]
}

export default function NavMinimap() {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const [size, setSize] = useState(168)

  const selectedRoute = useStore(s => s.selectedRoute)
  const userLocation = useStore(s => s.userLocation)
  const userHeading = useStore(s => s.userHeading)
  const routeSteps = useStore(s => s.routeSteps)
  const currentStepIndex = useStore(s => s.currentStepIndex)
  const stepDistLabel = useStore(s => s.stepDistLabel)
  const savedPins = useStore(s => s.savedPins)

  // Measure the wrap so the canvas always matches its CSS size.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width
      if (w && Math.abs(w - size) > 1) setSize(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const paintRef = useRef(null)
  paintRef.current = { selectedRoute, userLocation, userHeading, routeSteps, currentStepIndex, savedPins }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size <= 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr

    let raf = 0
    let lastDraw = 0

    const draw = (now) => {
      raf = requestAnimationFrame(draw)
      // ~12 fps is plenty for a minimap.
      if (now - lastDraw < 80) return
      lastDraw = now
      paint(canvas, dpr, size, paintRef.current)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [size])

  const next = routeSteps[currentStepIndex + 1]
  const icon = maneuverIcon(next?.maneuver, next?.modifier)

  return (
    <div className={styles.cluster} aria-label="Route minimap">
      <div className={styles.mapWrap} ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{ width: size, height: size }}
        />
      </div>
      <div className={styles.turnCard}>
        <span className={styles.turnIcon}>{icon}</span>
        <div className={styles.turnText}>
          <strong>{stepDistLabel || next?.distanceLabel || '—'}</strong>
          <span>{next?.instruction ?? next?.street ?? 'Continue'}</span>
        </div>
      </div>
    </div>
  )
}

function paint(cv, dpr, SIZE, state) {
  const { selectedRoute, userLocation, userHeading, routeSteps, currentStepIndex, savedPins } = state
  const ctx = cv.getContext('2d')
  const W = SIZE * dpr, H = SIZE * dpr
  const s = dpr
  ctx.clearRect(0, 0, W, H)

  const loc = userLocation
  if (!loc) return
  const heading = Number.isFinite(userHeading) ? userHeading : 0
  const hRad = (heading * Math.PI) / 180
  const cosH = Math.cos(-hRad), sinH = Math.sin(-hRad)
  const cosLat = Math.cos((loc.lat * Math.PI) / 180)

  // Vehicle sits below center so more route is visible ahead.
  const cx = W / 2, cy = H * 0.64
  const pxPerM = (H * 0.60) / AHEAD_M

  const project = (lng, lat) => {
    const [dx, dy] = toMeters(lng, lat, loc.lng, loc.lat, cosLat)
    const rx = dx * cosH - dy * sinH
    const ry = dx * sinH + dy * cosH
    return [cx + rx * pxPerM, cy - ry * pxPerM]
  }
  const inView = (x, y, pad = 30 * s) =>
    x > -pad && x < W + pad && y > -pad && y < H + pad

  const coords = selectedRoute?.geometry?.coordinates
  if (Array.isArray(coords) && coords.length > 1) {
    // Nearest route point (coarse scan is fine at 12 fps).
    let best = 0, bestD = Infinity
    for (let i = 0; i < coords.length; i += 2) {
      const dx = coords[i][0] - loc.lng, dy = coords[i][1] - loc.lat
      const d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; best = i }
    }
    for (let i = Math.max(0, best - 2); i < Math.min(coords.length, best + 3); i++) {
      const dx = coords[i][0] - loc.lng, dy = coords[i][1] - loc.lat
      const d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; best = i }
    }

    const pts = []
    let acc = 0
    const start = Math.max(0, best - 10)
    for (let i = start; i < coords.length; i++) {
      const [x, y] = project(coords[i][0], coords[i][1])
      pts.push({ x, y, i })
      if (pts.length > 1) {
        const p = pts[pts.length - 2]
        acc += Math.hypot(x - p.x, y - p.y) / pxPerM
      }
      if (i >= best && acc > AHEAD_M + BEHIND_M) break
    }

    const splitAt = pts.findIndex(p => p.i >= best)
    // FM6 ribbon: thin flat white line, no glow, no shadow.
    const drawRibbon = (list, style, width) => {
      if (list.length < 2) return
      ctx.beginPath()
      list.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.strokeStyle = style
      ctx.lineWidth = width * s
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    // Traveled = dim grey; upcoming = white ribbon (FM6 track outline).
    drawRibbon(pts.slice(0, splitAt + 1), 'rgba(154,160,168,0.45)', 2.5)
    drawRibbon(pts.slice(Math.max(0, splitAt)), '#c9cdd3', 3)

    // Destination marker if it falls in view.
    const last = coords[coords.length - 1]
    const [dx0, dy0] = toMeters(last[0], last[1], loc.lng, loc.lat, cosLat)
    if (Math.hypot(dx0, dy0) < AHEAD_M + BEHIND_M) {
      const [fx, fy] = project(last[0], last[1])
      if (inView(fx, fy)) {
        ctx.beginPath()
        ctx.arc(fx, fy, 4.5 * s, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
      }
    }
  } else {
    // No route geometry yet — draw a faint heading tick so the panel
    // doesn't look dead.
    ctx.strokeStyle = 'rgba(154,160,168,0.4)'
    ctx.lineWidth = 2.5 * s
    ctx.beginPath()
    ctx.moveTo(cx, cy + 26 * s)
    ctx.lineTo(cx, cy - 26 * s)
    ctx.stroke()
  }

  // Next-maneuver tick: small white dot, FM6 keeps the ribbon clean.
  const next = routeSteps[currentStepIndex + 1]
  if (next?.location) {
    const [mx, my] = project(next.location[0], next.location[1])
    if (inView(mx, my)) {
      ctx.beginPath()
      ctx.arc(mx, my, 3 * s, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }
  }

  // Saved places as orange dots — FM6's opponent markers.
  if (Array.isArray(savedPins)) {
    for (const pin of savedPins) {
      if (!pin?.lng || !pin?.lat) continue
      const [px, py] = project(pin.lng, pin.lat)
      if (!inView(px, py)) continue
      ctx.beginPath()
      ctx.arc(px, py, 3 * s, 0, Math.PI * 2)
      ctx.fillStyle = '#ff7a1a'
      ctx.fill()
    }
  }

  // Player marker: white filled triangle, always pointing up
  // (heading-up map — the world rotates under it).
  ctx.beginPath()
  ctx.moveTo(cx, cy - 11 * s)
  ctx.lineTo(cx + 7 * s, cy + 8 * s)
  ctx.lineTo(cx - 7 * s, cy + 8 * s)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
}
