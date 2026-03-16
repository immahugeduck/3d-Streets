import { useRef, useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import useStore from '../../store/appStore'
import { matchRoute } from '../../services/mapboxService'
import { interpretSketch } from '../../services/anthropicService'
import { drawRoute, fitRoute } from '../Map/MapView'
import styles from './SketchOverlay.module.css'

export default function SketchOverlay() {
  const canvasRef = useRef(null)
  const isDrawing = useRef(false)
  const rawPoints = useRef([]) // screen points

  const [status, setStatus]   = useState('idle')   // idle | drawing | processing | done | error
  const [aiHint, setAiHint]   = useState('Draw your route — finger or stylus')
  const [strokeCount, setStrokeCount] = useState(0)

  const exitSketch         = useStore(s => s.exitSketch)
  const setPhase           = useStore(s => s.setPhase)
  const userLocation       = useStore(s => s.userLocation)
  const mapRef             = useStore(s => s.mapRef)
  const setSelectedRoute   = useStore(s => s.setSelectedRoute)
  const setRouteOptions    = useStore(s => s.setRouteOptions)

  // ── Canvas setup ─────────────────────────────────────────────────────────
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

  // ── Redraw canvas ─────────────────────────────────────────────────────────
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const pts = rawPoints.current
    if (pts.length < 2) return

    // Glow pass
    ctx.save()
    ctx.strokeStyle = 'rgba(0,212,255,0.2)'
    ctx.lineWidth = 20
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
    ctx.stroke()
    ctx.restore()

    // Main stroke (dashed)
    ctx.save()
    ctx.strokeStyle = 'rgba(0,212,255,0.9)'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.setLineDash([8, 5])
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
    ctx.stroke()
    ctx.restore()

    // Start dot
    ctx.save()
    ctx.fillStyle = '#00E5A0'
    ctx.shadowBlur = 12; ctx.shadowColor = '#00E5A0'
    ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // End dot
    const last = pts[pts.length - 1]
    ctx.save()
    ctx.fillStyle = '#FF4E6A'
    ctx.shadowBlur = 12; ctx.shadowColor = '#FF4E6A'
    ctx.beginPath(); ctx.arc(last.x, last.y, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }, [])

  // ── Touch / mouse events ─────────────────────────────────────────────────
  function getPoint(e) {
    const t = e.touches ? e.touches[0] : e
    return { x: t.clientX, y: t.clientY }
  }

  function onStart(e) {
    e.preventDefault()
    isDrawing.current = true
    setStatus('drawing')
    const pt = getPoint(e)
    rawPoints.current.push(pt)
    redrawCanvas()
  }

  function onMove(e) {
    e.preventDefault()
    if (!isDrawing.current) return
    const pt = getPoint(e)
    rawPoints.current.push(pt)
    // Throttle redraw to every 3 points
    if (rawPoints.current.length % 3 === 0) redrawCanvas()
  }

  function onEnd(e) {
    e.preventDefault()
    isDrawing.current = false
    redrawCanvas()
    setStrokeCount(c => c + 1)
  }

  // ── Convert screen → map coords ──────────────────────────────────────────
  function screenToGeo(pts) {
    const map = mapRef
    if (!map) return []
    return pts.map(p => {
      const lngLat = map.unproject([p.x, p.y])
      return { lng: lngLat.lng, lat: lngLat.lat }
    })
  }

  // ── Process sketch ────────────────────────────────────────────────────────
  async function processSketch() {
    const pts = rawPoints.current
    if (pts.length < 15) {
      setAiHint('Draw a longer route to continue')
      return
    }

    setStatus('processing')
    setAiHint('AI is reading your route…')

    const geoCoords = screenToGeo(pts)
    const start = geoCoords[0]
    const end   = geoCoords[geoCoords.length - 1]

    // Run AI interpretation + road matching in parallel
    const [matchResult, aiDescription] = await Promise.all([
      matchRoute(geoCoords),
      interpretSketch({
        startCoord: start,
        endCoord: end,
        pointCount: pts.length,
        corridorMiles: haversineM(start.lat, start.lng, end.lat, end.lng) / 1609.34,
      })
    ])

    if (!matchResult) {
      setStatus('error')
      setAiHint('Could not snap to roads — try drawing closer to streets')
      return
    }

    // Show matched route on map
    drawRoute({ type: 'Feature', geometry: matchResult.geometry })
    fitRoute(matchResult.geometry.coordinates)

    const syntheticRoute = {
      id: 0,
      isRecommended: true,
      distanceLabel: matchResult.distanceLabel,
      durationLabel: matchResult.durationLabel,
      distanceM: matchResult.distanceM,
      durationS: matchResult.durationS,
      geometry: matchResult.geometry,
      steps: [],
      sketchRoute: true,
      aiDescription: aiDescription ?? 'Route along your drawn path',
    }

    setRouteOptions([syntheticRoute])
    setSelectedRoute(syntheticRoute)
    setStatus('done')
    setAiHint(aiDescription ?? 'Route ready — tap Start to go')

    setTimeout(() => {
      exitSketch()
      setPhase('route_preview')
    }, 1200)
  }

  function undoLast() {
    rawPoints.current = rawPoints.current.slice(0, Math.max(0, rawPoints.current.length - 40))
    setStrokeCount(c => Math.max(0, c - 1))
    redrawCanvas()
  }

  function clearAll() {
    rawPoints.current = []
    setStrokeCount(0)
    setStatus('idle')
    setAiHint('Draw your route — finger or stylus')
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }

  const haversineM = (lat1, lng1, lat2, lng2) => {
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  return (
    <>
      {/* Drawing canvas */}
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onMouseDown={onStart}
        onMouseMove={onMove}
        onMouseUp={onEnd}
      />

      {/* Status hint */}
      <motion.div
        className={styles.hint}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {status === 'processing' && (
          <div className={styles.processingDot} />
        )}
        {status === 'done' && <span className={styles.doneCheck}>✓</span>}
        {status === 'error' && <span className={styles.errorX}>✕</span>}
        <span>{aiHint}</span>
      </motion.div>

      {/* Toolbar */}
      <motion.div
        className={styles.toolbar}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <button className={styles.toolBtn} onClick={undoLast} disabled={strokeCount === 0}>
          <UndoIcon />
          <span>Undo</span>
        </button>

        <button className={styles.toolBtn} onClick={clearAll} disabled={strokeCount === 0}>
          <TrashIcon />
          <span>Clear</span>
        </button>

        <button
          className={`${styles.primaryBtn} ${strokeCount === 0 ? styles.disabled : ''}`}
          onClick={processSketch}
          disabled={strokeCount === 0 || status === 'processing'}
        >
          {status === 'processing' ? (
            <><SpinnerIcon /> Building Route…</>
          ) : (
            <><SparkleIcon /> Use This Route</>
          )}
        </button>

        <button className={styles.toolBtn} onClick={exitSketch}>
          <XIcon />
          <span>Cancel</span>
        </button>
      </motion.div>
    </>
  )
}

const UndoIcon   = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
const TrashIcon  = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const XIcon      = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const SparkleIcon = () => <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
const SpinnerIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={styles.spin}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
