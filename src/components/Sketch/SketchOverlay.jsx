import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useStore, { PHASE } from '../../store/appStore'
import { getDirections } from '../../services/mapboxService'
import { drawRoute, fitRoute } from '../Map/MapView'
import styles from './SketchOverlay.module.css'

// ── Draw mode phases ──────────────────────────────────────────────────────
// 'idle'       → ready, waiting for user to start drawing
// 'drawing'    → user is actively drawing a freehand stroke
// 'drawn'      → stroke complete, ready to build route
// 'processing' → fetching directions
// 'done'       → route ready

export default function SketchOverlay() {
  const canvasRef   = useRef(null)
  const isDrawing   = useRef(false)
  const rawPoints   = useRef([])
  const animFrameId = useRef(null)

  const [drawMode,  setDrawMode]  = useState('idle')
  const [startPin,  setStartPin]  = useState(null)
  const [endPin,    setEndPin]    = useState(null)
  const [panMode,   setPanMode]   = useState(false)

  const exitSketch         = useStore(s => s.exitSketch)
  const setPhase           = useStore(s => s.setPhase)
  const mapRef             = useStore(s => s.mapRef)
  const setSelectedRoute   = useStore(s => s.setSelectedRoute)
  const setRouteOptions    = useStore(s => s.setRouteOptions)
  const setDestinationOnly = useStore(s => s.setDestinationOnly)

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

  // ── Convert screen → geo via Mapbox projection ────────────────────────
  function screenToGeo(x, y) {
    const map = mapRef
    if (!map) return null
    const ll = map.unproject([x, y])
    return { lng: ll.lng, lat: ll.lat }
  }

  // ── Pin renderer ──────────────────────────────────────────────────────
  function drawPin(ctx, x, y, color, label) {
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur  = 16

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y - 20, 12, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(x - 6, y - 12)
    ctx.lineTo(x + 6, y - 12)
    ctx.lineTo(x, y)
    ctx.closePath()
    ctx.fill()

    ctx.shadowBlur     = 0
    ctx.fillStyle      = '#000'
    ctx.font           = 'bold 11px system-ui'
    ctx.textAlign      = 'center'
    ctx.textBaseline   = 'middle'
    ctx.fillText(label, x, y - 20)
    ctx.restore()
  }

  // ── Smooth curve through points (Catmull-Rom spline) ─────────────────
  function drawSmoothedStroke(ctx, pts) {
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y)
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2
        const my = (pts[i].y + pts[i + 1].y) / 2
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
      }
      const last = pts[pts.length - 1]
      ctx.lineTo(last.x, last.y)
    }
  }

  // ── Redraw canvas ─────────────────────────────────────────────────────
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const pts = rawPoints.current
    if (pts.length >= 2) {
      // Glow layer
      ctx.save()
      ctx.strokeStyle = 'rgba(0,212,255,0.15)'
      ctx.lineWidth   = 22
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      drawSmoothedStroke(ctx, pts)
      ctx.stroke()

      // Core stroke
      ctx.strokeStyle = 'rgba(0,212,255,0.85)'
      ctx.lineWidth   = 3.5
      ctx.setLineDash([10, 6])
      drawSmoothedStroke(ctx, pts)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }

    // Start pin (first point of stroke)
    if (startPin) drawPin(ctx, startPin.x, startPin.y, '#00E5A0', 'S')

    // End pin (last point of stroke while drawing, locked when done)
    if (endPin) drawPin(ctx, endPin.x, endPin.y, '#FF4E6A', 'E')
    else if (isDrawing.current && pts.length > 0) {
      // Live trailing end dot while drawing
      const last = pts[pts.length - 1]
      ctx.save()
      ctx.fillStyle   = 'rgba(255,78,106,0.7)'
      ctx.shadowColor = '#FF4E6A'
      ctx.shadowBlur  = 12
      ctx.beginPath()
      ctx.arc(last.x, last.y, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }, [startPin, endPin])

  useEffect(() => { redrawCanvas() }, [startPin, endPin, redrawCanvas])

  // ── Throttled redraw during draw via rAF ──────────────────────────────
  function scheduleRedraw() {
    if (animFrameId.current) return
    animFrameId.current = requestAnimationFrame(() => {
      animFrameId.current = null
      redrawCanvas()
    })
  }

  // ── Pointer helpers ───────────────────────────────────────────────────
  function getPoint(e) {
    const t = e.touches ? e.touches[0] : e
    return { x: t.clientX, y: t.clientY }
  }

  // ── Draw handlers ─────────────────────────────────────────────────────
  function onStart(e) {
    e.preventDefault()
    if (panMode) return
    if (drawMode === 'processing' || drawMode === 'done') return

    const pt  = getPoint(e)
    const geo = screenToGeo(pt.x, pt.y)
    if (!geo) return

    // Start fresh stroke
    isDrawing.current = true
    rawPoints.current = [pt]
    setStartPin({ ...pt, ...geo })
    setEndPin(null)
    setDrawMode('drawing')
    redrawCanvas()
  }

  function onMove(e) {
    e.preventDefault()
    if (!isDrawing.current || drawMode !== 'drawing') return
    const pt = getPoint(e)
    rawPoints.current.push(pt)
    scheduleRedraw()
  }

  function onEnd(e) {
    e.preventDefault()
    if (!isDrawing.current) return
    isDrawing.current = false

    const pts = rawPoints.current
    if (pts.length < 5) {
      // Too short — treat as a tap, reset
      resetSketch()
      return
    }

    // Anchor end pin at last drawn point
    const last = pts[pts.length - 1]
    const geo  = screenToGeo(last.x, last.y)
    if (!geo) { resetSketch(); return }

    setEndPin({ ...last, ...geo })
    setDrawMode('drawn')
    redrawCanvas()
  }

  // ── Build route from stroke anchors ──────────────────────────────────
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

    setDestinationOnly({
      id:   'sketch-destination',
      name: 'Sketch destination',
      lng:  endPin.lng,
      lat:  endPin.lat,
    })
    setRouteOptions([syntheticRoute])
    setSelectedRoute(syntheticRoute)
    setDrawMode('done')

    setTimeout(() => {
      exitSketch()
      setPhase(PHASE.ROUTE_PREVIEW)
    }, 900)
  }

  // ── Reset ─────────────────────────────────────────────────────────────
  function resetSketch() {
    isDrawing.current = false
    rawPoints.current = []
    setStartPin(null)
    setEndPin(null)
    setDrawMode('idle')
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }

  // ── Status hint text ──────────────────────────────────────────────────
  const hintText = panMode
    ? 'Pan mode — move map freely, tap Pan to resume drawing'
    : ({
        idle:       'Draw your route — press & drag to start',
        drawing:    'Keep drawing… lift to finish',
        drawn:      'Looks good! Tap "Build Route" or redraw',
        processing: 'Building route…',
        done:       'Route ready!',
        error:      'Could not find a route — try again',
      }[drawMode] ?? '')

  const canBuild  = drawMode === 'drawn' && startPin && endPin
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
          cursor:        panMode ? 'grab' : drawMode === 'drawing' ? 'crosshair' : 'pointer',
          pointerEvents: panMode ? 'none' : 'auto',
        }}
      />

      {/* Hint pill */}
      <motion.div
        className={styles.hint}
        key={hintText}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {isWorking && <div className={styles.processingDot} />}
        {drawMode === 'done'  && <span className={styles.doneCheck}>✓</span>}
        {drawMode === 'error' && <span className={styles.errorX}>✕</span>}
        {drawMode === 'drawn' && !isWorking && <span className={styles.readyDot} />}
        <span>{hintText}</span>
      </motion.div>

      {/* Live status strip while drawing */}
      <AnimatePresence>
        {drawMode === 'drawing' && (
          <motion.div
            className={styles.drawingBadge}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
          >
            <span className={styles.liveDot} />
            Drawing
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <motion.div
        className={styles.toolbar}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <button
          className={`${styles.toolBtn} ${panMode ? styles.toolBtnActive : ''}`}
          onClick={() => setPanMode(p => !p)}
          disabled={isWorking}
          title="Toggle pan mode"
        >
          <PanIcon />
          <span>Pan</span>
        </button>

        <button
          className={styles.toolBtn}
          onClick={resetSketch}
          disabled={drawMode === 'idle' || isWorking}
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
            <><SpinnerIcon /> Building…</>
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

// ── Icon components ───────────────────────────────────────────────────────
const PanIcon     = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2a8 8 0 0 1-7.4-5L3 16"/></svg>
const TrashIcon   = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const XIcon       = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const SparkleIcon = () => <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
const SpinnerIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={styles.spin}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
