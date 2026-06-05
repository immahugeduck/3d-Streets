import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import useStore, { PHASE, MAP_STYLES } from './store/appStore'
import { useLocation } from './hooks/useLocation'
import { useNavigationProgress } from './hooks/useNavigationProgress'

import MapView            from './components/Map/MapView'
import SearchBar          from './components/Search/SearchBar'
import MapControls        from './components/Controls/MapControls'
import NavigationHUD      from './components/Navigation/NavigationHUD'
import CarHoodOverlay     from './components/Navigation/CarHoodOverlay'
import GameShell          from './components/GameUI/GameShell'
import VehicleEntryOverlay from './components/Navigation/VehicleEntryOverlay'
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
  useNavigationProgress()

  const phase           = useStore(s => s.phase)
  const showPOI         = useStore(s => s.showPOI)
  const showSettings    = useStore(s => s.showSettings)
  const setShowSettings = useStore(s => s.setShowSettings)
  const showRouteStops  = useStore(s => s.showRouteStops)
  const showNavSidebar  = useStore(s => s.showNavSidebar)
  const pendingPin      = useStore(s => s.pendingPin)

  return (
    <div className={styles.app}>
      <MapView />

      <AnimatePresence>
        {phase !== PHASE.SKETCHING && <GameShell key="game-shell" />}
      </AnimatePresence>

      <VehicleEntryOverlay />

      <AnimatePresence>
        {phase === PHASE.SKETCHING && <SketchOverlay key="sketch" />}
      </AnimatePresence>

      <AnimatePresence>
        {phase === PHASE.NAVIGATING && <NavigationHUD key="hud" />}
      </AnimatePresence>

      <AnimatePresence>
        {phase === PHASE.NAVIGATING && <CarHoodOverlay key="car-hood" />}
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
        {pendingPin && <PinActionCard key="pin-action" />}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <SettingsOverlay key="settings" onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Pin Action Card ────────────────────────────────────────────────────────
function PinActionCard() {
  const pendingPin     = useStore(s => s.pendingPin)
  const clearPendingPin = useStore(s => s.clearPendingPin)
  const addSavedPin    = useStore(s => s.addSavedPin)
  const setDestination = useStore(s => s.setDestination)
  const setPhase       = useStore(s => s.setPhase)

  function navigateHere() {
    setDestination({ ...pendingPin, id: `pin-dest-${Date.now()}` })
    setPhase(PHASE.ROUTE_PREVIEW)
    clearPendingPin()
  }

  function savePin() {
    addSavedPin(pendingPin)
    clearPendingPin()
  }

  return (
    <motion.div
      className={styles.pinCard}
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
    >
      <div className={styles.pinCardIcon}>📍</div>
      <div className={styles.pinCardInfo}>
        <div className={styles.pinCardTitle}>Dropped pin</div>
        <div className={styles.pinCardCoords}>{pendingPin?.name}</div>
      </div>
      <div className={styles.pinCardActions}>
        <button className={styles.pinNavBtn} onClick={navigateHere}>Navigate here</button>
        <button className={styles.pinSaveBtn} onClick={savePin}>Save</button>
        <button className={styles.pinDismissBtn} onClick={clearPendingPin}>✕</button>
      </div>
    </motion.div>
  )
}

// ── Settings Overlay ───────────────────────────────────────────────────────
const SETTINGS_PAGES = ['Map', 'Drive']

const COCKPIT_MODES = [
  { key: 'sport',   label: 'Sport',   icon: 'GT' },
  { key: 'truck',   label: 'Truck',   icon: 'TR' },
  { key: 'suv',     label: 'SUV',     icon: 'SV' },
  { key: 'van',     label: 'Van',     icon: 'VN' },
  { key: 'minimal', label: 'Minimal', icon: 'MI' },
]

const VIEW_MODES = [
  { key: 'cockpit', label: 'Cockpit', icon: '◒' },
  { key: 'hood',    label: 'Hood',    icon: '━' },
]

function SettingsOverlay({ onClose }) {
  const [page, setPage] = useState(0)

  const mapStyle       = useStore(s => s.mapStyle)
  const setMapStyle    = useStore(s => s.setMapStyle)
  const is3D           = useStore(s => s.is3D)
  const setIs3D        = useStore(s => s.setIs3D)
  const showTraffic    = useStore(s => s.showTraffic)
  const setShowTraffic = useStore(s => s.setShowTraffic)
  const drivingView    = useStore(s => s.drivingView)
  const setDrivingView = useStore(s => s.setDrivingView)
  const cockpitView    = useStore(s => s.cockpitView)
  const setCockpitView = useStore(s => s.setCockpitView)
  const cockpitMode    = useStore(s => s.cockpitMode)
  const setCockpitMode = useStore(s => s.setCockpitMode)

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

        {/* Page dots */}
        <div className={styles.pageDots}>
          {SETTINGS_PAGES.map((label, i) => (
            <button
              key={label}
              className={`${styles.pageDot} ${page === i ? styles.pageDotActive : ''}`}
              onClick={() => setPage(i)}
              aria-label={label}
            />
          ))}
        </div>

        {/* Page label + close */}
        <div className={styles.settingsHeader}>
          <div className={styles.settingsTitle}>{SETTINGS_PAGES[page]}</div>
          <button className={styles.settingsClose} onClick={onClose}>✕</button>
        </div>

        {/* Paged content */}
        <AnimatePresence mode="wait">
          {page === 0 && (
            <motion.div
              key="map-page"
              className={styles.settingsBody}
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.18 }}
            >
              <div className={styles.section}>
                <div className={styles.sectionLabel}>MAP STYLE</div>
                <div className={styles.styleGrid}>
                  {Object.entries(MAP_STYLES).map(([key, s]) => (
                    <button key={key} className={`${styles.styleCard} ${mapStyle === key ? styles.styleCardActive : ''}`} onClick={() => setMapStyle(key)}>
                      <span className={styles.styleCardIcon}>{s.icon}</span>
                      <span className={styles.styleCardLabel}>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionLabel}>DISPLAY</div>
                <ToggleRow label="3D Buildings" value={is3D}        onChange={setIs3D} />
                <ToggleRow label="Live Traffic" value={showTraffic} onChange={setShowTraffic} />
              </div>

              <div className={styles.appVersion}>3D Streets v1.0</div>
            </motion.div>
          )}

          {page === 1 && (
            <motion.div
              key="drive-page"
              className={styles.settingsBody}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.18 }}
            >
              <div className={styles.section}>
                <div className={styles.sectionLabel}>DRIVE VIEW</div>
                <div className={styles.styleGrid}>
                  {VIEW_MODES.map(v => (
                    <button key={v.key} className={`${styles.styleCard} ${cockpitView === v.key ? styles.styleCardActive : ''}`} onClick={() => setCockpitView(v.key)}>
                      <span className={styles.styleCardIcon}>{v.icon}</span>
                      <span className={styles.styleCardLabel}>{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionLabel}>VEHICLE PROFILE</div>
                <div className={styles.styleGrid}>
                  {COCKPIT_MODES.map(v => (
                    <button key={v.key} className={`${styles.styleCard} ${cockpitMode === v.key ? styles.styleCardActive : ''}`} onClick={() => setCockpitMode(v.key)}>
                      <span className={styles.styleCardIcon}>{v.icon}</span>
                      <span className={styles.styleCardLabel}>{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionLabel}>OPTIONS</div>
                <ToggleRow label="Driving View" value={drivingView} onChange={setDrivingView} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <button className={`${styles.toggle} ${value ? styles.toggleOn : ''}`} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
        <div className={styles.toggleThumb} />
      </button>
    </div>
  )
}
