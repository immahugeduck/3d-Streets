import { AnimatePresence, motion } from 'framer-motion'
import useStore, { PHASE, MAP_STYLES } from './store/appStore'
import { useLocation } from './hooks/useLocation'

import MapView            from './components/Map/MapView'
import SearchBar          from './components/Search/SearchBar'
import MapControls        from './components/Controls/MapControls'
import NavigationHUD      from './components/Navigation/NavigationHUD'
import RoutePreviewPanel  from './components/Navigation/RoutePreviewPanel'
import RouteStopsPanel    from './components/Navigation/RouteStopsPanel'
import NavigationSidebar  from './components/Navigation/NavigationSidebar'
import AICopilot          from './components/AI/AICopilot'
import SketchOverlay      from './components/Sketch/SketchOverlay'
import POIPanel           from './components/POI/POIPanel'
import './styles/design-system.css'
import styles from './App.module.css'

export default function App() {
  useLocation()

  const phase             = useStore(s => s.phase)
  const showPOI           = useStore(s => s.showPOI)
  const showSettings      = useStore(s => s.showSettings)
  const setShowSettings   = useStore(s => s.setShowSettings)
  const showRouteStops    = useStore(s => s.showRouteStops)
  const showNavSidebar    = useStore(s => s.showNavSidebar)

  return (
    <div className={styles.app}>
      <MapView />

      <AnimatePresence>
        {phase === PHASE.SKETCHING && <SketchOverlay key="sketch" />}
      </AnimatePresence>

      <AnimatePresence>
        {phase === PHASE.NAVIGATING && <NavigationHUD key="hud" />}
      </AnimatePresence>

      {phase !== PHASE.NAVIGATING && phase !== PHASE.SKETCHING && (
        <>
          <SearchBar />
          <MapControls />
        </>
      )}

      <AnimatePresence>
        {phase === PHASE.ROUTE_PREVIEW && <RoutePreviewPanel key="preview" />}
      </AnimatePresence>

      <AnimatePresence>
        {phase === PHASE.AI_CHAT && <AICopilot key="ai" />}
      </AnimatePresence>

      <AnimatePresence>
        {showPOI && <POIPanel key="poi" />}
      </AnimatePresence>

      <AnimatePresence>
        {phase === PHASE.NAVIGATING && showRouteStops && (
          <RouteStopsPanel key="route-stops" />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === PHASE.NAVIGATING && showNavSidebar && (
          <NavigationSidebar key="nav-sidebar" />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <SettingsOverlay key="settings" onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function SettingsOverlay({ onClose }) {
  const mapStyle        = useStore(s => s.mapStyle)
  const setMapStyle     = useStore(s => s.setMapStyle)
  const is3D            = useStore(s => s.is3D)
  const setIs3D         = useStore(s => s.setIs3D)
  const showTraffic     = useStore(s => s.showTraffic)
  const setShowTraffic  = useStore(s => s.setShowTraffic)
  const showSpeedHUD    = useStore(s => s.showSpeedHUD)
  const setShowSpeedHUD = useStore(s => s.setShowSpeedHUD)

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <motion.div
        className={styles.settingsPanel}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 40 }}
      >
        <div className={styles.handle} />
        <div className={styles.settingsHeader}>
          <div className={styles.settingsTitle}>3D Streets</div>
          <button className={styles.settingsClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.settingsBody}>
          <div className={styles.section}>
            <div className={styles.sectionLabel}>MAP STYLE</div>
            <div className={styles.styleGrid}>
              {Object.entries(MAP_STYLES).map(([key, s]) => (
                <button
                  key={key}
                  className={`${styles.styleCard} ${mapStyle === key ? styles.styleCardActive : ''}`}
                  onClick={() => setMapStyle(key)}
                >
                  <span className={styles.styleCardIcon}>{s.icon}</span>
                  <span className={styles.styleCardLabel}>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>DISPLAY</div>
            <ToggleRow label="3D Buildings"  value={is3D}         onChange={setIs3D} />
            <ToggleRow label="Live Traffic"  value={showTraffic}  onChange={setShowTraffic} />
            <ToggleRow label="Speed HUD"     value={showSpeedHUD} onChange={setShowSpeedHUD} />
          </div>

          <div className={styles.appVersion}>
            3D Streets v1.0 · Built with Mapbox + Claude
          </div>
        </div>
      </motion.div>
    </>
  )
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <button
        className={`${styles.toggle} ${value ? styles.toggleOn : ''}`}
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
      >
        <div className={styles.toggleThumb} />
      </button>
    </div>
  )
}
