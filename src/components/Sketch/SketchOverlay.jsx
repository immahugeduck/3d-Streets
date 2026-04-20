import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useStore from '../../store/appStore'
import { getDirections } from '../../services/mapboxService'
import { drawRoute, fitRoute } from '../Map/MapView'
import styles from './SketchOverlay.module.css'

// ── Draw mode phases ──────────────────────────────────────────────────────
// 'pin_start'  → user taps to place the start pin
// 'pin_end'    → user taps to place the end pin
// 'drawing'    → user draws the route stroke (cosmetic only)
// 'processing' → fetching directions
// 'done'       → route ready

export default function SketchOverlay() {
  const canvasRef  = useRef(null)
  const isDrawing  = useRef(false)
  const rawPoints  = useRef([])

  // Two-pin anchors (screen coords + geo coords)
  const [startPin,  setStartPin]  = useState(null)  // { x, y, lng, lat }
  const [endPin,    setEndPin]    = useState(null)   // { x, y, lng, lat }
  const [drawMode,  setDrawMode]  = useState('pin_start')
  const [hasStroke, setHasStroke] = useState(false)
  const [panMode,   setPanMode]   = useState(false)  // lets map events through

  const exitSketch       = useStore(s => s.exitSketch)
  const setPhase         = useStore(s => s.setPhase)
  const mapRef           = useStore(s => s.mapRef)
  const setSelectedRoute = useStore(s => s.setSelectedRoute)
  const setRouteOptions  = useStore(s => s.setRouteOptions)

  // ── Canvas sizing ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // ── Convert a screen point → geo via the live Mapbox projection ───────
  function screenToGeo(x, y) {
    const map = mapRef
    if (!map) return null
    const ll = map.unproject([x, y])
    return { lng: ll.lng, lat: ll.lat }
  }

  // ── Redraw canvas: pins + freehand stroke ─────────────────────────────
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Freehand stroke (cosmetic guide line)
    const pts = rawPoints.current
    if (pts.length >= 2) {
      ctx.save()
      ctx.strokeStyle = 'rgba(0,212,255,0.18)'
      ctx.lineWidth = 18
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.stroke()

      ctx.strokeStyle = 'rgba(0,212,255,0.75)'
      ctx.lineWidth = 3
      ctx.setLineDash([8, 5])
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.stroke()
      ctx.restore()
    }

    // Start pin
    if (startPin) {
      drawPin(ctx, startPin.x, startPin.y, '#00E5A0', 'S')
    }

    // End pin
    if (endPin) {
      drawPin(ctx, endPin.x, endPin.y, '#FF4E6A', 'E')
    }
  }, [startPin, endPin])

  useEffect(() => { redrawCanvas() }, [startPin, endPin, redrawCanvas])

  // ── Pin renderer ──────────────────────────────────────────────────────
  function drawPin(ctx, x, y, color, label) {
    ctx.save()
    // Drop shadow
    ctx.shadowColor = color
    ctx.shadowBlur = 16

    // Pin body (teardrop)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y - 20, 12, 0, Math.PI * 2)
    ctx.fill()

    // Pin tail
    ctx.beginPath()
    ctx.moveTo(x - 6, y - 12)
    ctx.lineTo(x + 6, y - 12)
    ctx.lineTo(x, y)
    ctx.closePath()
    ctx.fill()

    // Label
    ctx.shadowBlur = 0
    ctx.fillStyle = '#000'
    ctx.font = 'bold 11px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y - 20)
    ctx.restore()
  }

  // ── Input handlers ────────────────────────────────────────────────────
  function getPoint(e) {
    const t = e.touches ? e.touches[0] : e
    return { x: t.clientX, y: t.clientY }
  }

  function onStart(e) {
    e.preventDefault()
    if (panMode) return  // canvas is pointer-events:none so this won't fire, but guard anyway
    const pt = getPoint(e)

    if (drawMode === 'pin_start') {
      const geo = screenToGeo(pt.x, pt.y)
      if (!geo) return
      setStartPin({ ...pt, ...geo })
      setDrawMode('pin_end')
      return
    }

    if (drawMode === 'pin_end') {
      const geo = screenToGeo(pt.x, pt.y)
      if (!geo) return
      setEndPin({ ...pt, ...geo })
      setDrawMode('drawing')
      // Seed the stroke at the end pin so the freehand naturally connects
      rawPoints.current = [pt]
      return
    }

    if (drawMode === 'drawing') {
      isDrawing.current = true
      rawPoints.current.push(pt)
      redrawCanvas()
    }
  }

  function onMove(e) {
    e.preventDefault()
    if (drawMode !== 'drawing' || !isDrawing.current) return
    const pt = getPoint(e)
    rawPoints.current.push(pt)
    if (rawPoints.current.length % 3 === 0) redrawCanvas()
  }

  function onEnd(e) {
    e.preventDefault()
    if (!isDrawing.current) return
    isDrawing.current = false
    setHasStroke(true)
    redrawCanvas()
  }

  // ── Build route from the two anchor pins ─────────────────────────────
  async function buildRoute() {
    if (!startPin || !endPin) return
    setDrawMode('processing')

    const routes = await getDirections({
      origin:      { lng: startPin.lng, lat: startPin.lat },
      destination: { lng: endPin.lng,   lat: endPin.lat   },
      waypoints:   [],
      profile:     'mapbox/driving-traffic',
    })

    if (!routes || routes.length === 0) {
      setDrawMode('error')
      return
    }

    const primary = routes[0]

    drawRoute({ type: 'Feature', geometry: primary.geometry })
    fitRoute(primary.geometry.coordinates)

    const syntheticRoute = {
      ...primary,
      sketchRoute:   true,
      aiDescription: 'Route along your drawn path',
    }

    setRouteOptions([syntheticRoute])
    setSelectedRoute(syntheticRoute)
    setDrawMode('done')

    setTimeout(() => {
      exitSketch()
      setPhase('route_preview')
    }, 900)
  }

  // ── Reset helpers ─────────────────────────────────────────────────────
  function resetPins() {
    setStartPin(null)
    setEndPin(null)
    setDrawMode('pin_start')
    setHasStroke(false)
    rawPoints.current = []
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }

  function undoStep() {
    if (drawMode === 'drawing' || drawMode === 'pin_end') {
      // Go back one step: if we have an end pin, remove it; else remove start
      if (endPin) {
        setEndPin(null)
        setDrawMode('pin_end')
        rawPoints.current = []
        setHasStroke(false)
      } else if (startPin) {
        setStartPin(null)
        setDrawMode('pin_start')
      }
      redrawCanvas()
    }
  }

  // ── Status hint text ──────────────────────────────────────────────────
  const hintText = panMode
    ? 'Pan mode — move the map freely, tap Pan again to resume'
    : ({
        pin_start:  'Tap to place your START point',
        pin_end:    'Tap to place your END point',
        drawing:    'Draw your route — or tap "Build Route" to go',
        processing: 'Building route…',
        done:       'Route ready',
        error:      'Could not find a route — try different points',
      }[drawMode] ?? '')

  const canBuild  = startPin && endPin && drawMode === 'drawing'
  const isWorking = drawMode === 'processing'

  return (
    <>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onTouchStart={panMode ? undefined : onStart}
        onTouchMove={panMode ? undefined : onMove}
        onTouchEnd={panMode ? undefined : onEnd}
        onMouseDown={panMode ? undefined : onStart}
        onMouseMove={panMode ? undefined : onMove}
        onMouseUp={panMode ? undefined : onEnd}
        style={{
          cursor: panMode ? 'grab' : drawMode === 'drawing' ? 'crosshair' : 'pointer',
          pointerEvents: panMode ? 'none' : 'auto',
        }}
      />

      {/* Step indicator */}
      <motion.div
        className={styles.hint}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {isWorking && <div className={styles.processingDot} />}
        {drawMode === 'done'  && <span className={styles.doneCheck}>✓</span>}
        {drawMode === 'error' && <span className={styles.errorX}>✕</span>}
        <span>{hintText}</span>
      </motion.div>

      {/* Pin step breadcrumbs */}
      <AnimatePresence>
        <motion.div
          className={styles.stepRow}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StepDot
            label="1"
            text="Start"
            done={!!startPin}
            active={drawMode === 'pin_start'}
            color="#00E5A0"
          />
          <div className={styles.stepLine} />
          <StepDot
            label="2"
            text="End"
            done={!!endPin}
            active={drawMode === 'pin_end'}
            color="#FF4E6A"
          />
          <div className={styles.stepLine} />
          <StepDot
            label="3"
            text="Draw"
            done={hasStroke}
            active={drawMode === 'drawing'}
            color="#00D4FF"
          />
        </motion.div>
      </AnimatePresence>

      {/* Toolbar */}
      <motion.div
        className={styles.toolbar}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <button
          className={styles.toolBtn}
          onClick={undoStep}
          disabled={!startPin || isWorking}
        >
          <UndoIcon />
          <span>Undo</span>
        </button>

        <button
          className={`${styles.toolBtn} ${panMode ? styles.toolBtnActive : ''}`}
          onClick={() => setPanMode(p => !p)}
          disabled={isWorking}
          title="Toggle pan mode — lets you move the map without placing pins"
        >
          <PanIcon />
          <span>Pan</span>
        </button>

        <button
          className={styles.toolBtn}
          onClick={resetPins}
          disabled={!canClear}
        >
          <UndoIcon />
          <span>Undo</span>
        </button>

        <button
          className={styles.toolBtn}
          onClick={resetPins}
          disabled={!startPin || isWorking}
        >
          <TrashIcon />
          <span>Clear</span>
        </button>

        <button
          className={`${styles.primaryBtn} ${!canBuild ? styles.disabled : ''}`}
          onClick={buildRoute}
          disabled={!canBuild || isWorking}
        >
          {isWorking ? (
            <><SpinnerIcon /> Building Route…</>
          ) : (
            <><SparkleIcon /> Build Route</>
          )}
        </button>

        <button className={styles.toolBtn} onClick={exitSketch} disabled={isWorking}>
          <XIcon />
          <span>Cancel</span>
        </button>
      </motion.div>
    </>
  )
}

// ── Step dot component ────────────────────────────────────────────────────
function StepDot({ label, text, done, active, color }) {
  return (
    <div className={styles.stepDot}>
      <div
        className={`${styles.stepCircle} ${done ? styles.stepDone : ''} ${active ? styles.stepActive : ''}`}
        style={done || active ? { borderColor: color, background: done ? color : 'transparent' } : {}}
      >
        {done ? <CheckIcon size={10} /> : <span>{label}</span>}
      </div>
      <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ''}`}>{text}</span>
    </div>
  )
}

// ── Icon components ───────────────────────────────────────────────────────
const UndoIcon    = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
const PanIcon     = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2a8 8 0 0 1-7.4-5L3 16"/></svg>
const TrashIcon   = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const XIcon       = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const SparkleIcon = () => <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
const SpinnerIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={styles.spin}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
const CheckIcon   = ({ size = 14 }) => <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
