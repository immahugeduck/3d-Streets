/**
 * ChaseVehicleLayer — Forza-style 3D chase vehicle rendered as a Mapbox
 * custom layer (three.js). This is the "overlay onto a mapping system":
 * a stylized low-poly car glued to the user's GPS position, seen from the
 * behind-vehicle chase camera, with game-style paint, glowing taillight bar
 * and cyan underglow.
 *
 * Coordinate convention: the car model is built in ENU space —
 *   local +X = east, +Y = north (front of car), +Z = up.
 * The render matrix maps that into Mapbox mercator space with a Y flip,
 * then rotates about +Z by -bearing so the nose follows the heading.
 */
import * as THREE from 'three'
import mapboxgl from 'mapbox-gl'

const LAYER_ID = 'forza-chase-vehicle'
// Game-style cheat: real-world cars read too small at nav zooms, so the
// model is scaled up. Tune with chaseCamera zoom to taste.
const MODEL_SCALE = 2.0

const PROFILE_PAINT = {
  sport:   { color: 0x0d1526, roughness: 0.30, glow: 0.60, ride: 0.00, boxy: false },
  truck:   { color: 0x181c26, roughness: 0.55, glow: 0.35, ride: 0.24, boxy: true  },
  suv:     { color: 0x12202f, roughness: 0.42, glow: 0.45, ride: 0.14, boxy: true  },
  van:     { color: 0x1a2030, roughness: 0.50, glow: 0.35, ride: 0.14, boxy: true  },
  minimal: { color: 0x0b0e16, roughness: 0.40, glow: 0.12, ride: 0.00, boxy: false },
}

// ── Module state ──────────────────────────────────────────────────────────
let _pose = null            // { lng, lat, heading }
let _profile = 'sport'
let _map = null

export function updateChaseVehiclePose(pose) {
  _pose = pose
  // Force a repaint so the car tracks GPS even when the camera is idle.
  if (_map && _map.getLayer(LAYER_ID)) {
    try { _map.triggerRepaint() } catch { /* noop */ }
  }
}

export function setChaseVehicleProfile(profile) {
  if (PROFILE_PAINT[profile]) _profile = profile
}

export function addChaseVehicleLayer(map) {
  if (!map || map.getLayer(LAYER_ID)) return
  _map = map

  const impl = {
    id: LAYER_ID,
    type: 'custom',
    renderingMode: '3d',

    onAdd(map, gl) {
      this.camera = new THREE.PerspectiveCamera()
      this.scene = new THREE.Scene()

      // — Lighting: cool night-showroom rig —
      this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x0a0c14, 0.95))
      const key = new THREE.DirectionalLight(0xffffff, 1.7)
      key.position.set(18, 26, 30)
      this.scene.add(key)
      const rim = new THREE.DirectionalLight(0x66aaff, 0.8)
      rim.position.set(-22, -18, 12)
      this.scene.add(rim)
      const spill = new THREE.PointLight(0x00d4ff, 10, 14, 2)
      spill.position.set(0, 0, 1.4)
      this.scene.add(spill)

      this.car = buildCar()
      this.scene.add(this.car)

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      })
      this.renderer.autoClear = false
    },

    render(gl, matrix) {
      if (!_pose) return
      try {
        const { lng, lat, heading } = _pose
        const headingRad = ((Number.isFinite(heading) ? heading : 0) * Math.PI) / 180
        const merc = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0)
        const s = merc.meterInMercatorCoordinateUnits() * MODEL_SCALE

        const m = new THREE.Matrix4().fromArray(matrix)
        const t = new THREE.Matrix4().makeTranslation(merc.x, merc.y, merc.z)
        const sc = new THREE.Matrix4().makeScale(s, -s, s)
        const rz = new THREE.Matrix4().makeRotationAxis(
          new THREE.Vector3(0, 0, 1),
          -headingRad
        )

        this.camera.projectionMatrix.copy(m).multiply(t).multiply(sc).multiply(rz)
        this.renderer.state.reset()
        this.renderer.render(this.scene, this.camera)
      } catch (err) {
        // Never let the overlay take down the map frame.
        console.warn('[ChaseVehicle] render failed:', err?.message)
      }
    },

    onRemove() {
      try {
        this.scene?.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            ;(Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(mt => {
              if (mt.map) mt.map.dispose()
              mt.dispose()
            })
          }
        })
        this.renderer?.dispose()
      } catch { /* noop */ }
      this.scene = null
      this.camera = null
      this.renderer = null
      this.car = null
    },
  }

  map.addLayer(impl)
  applyProfile(impl)
}

export function removeChaseVehicleLayer(map) {
  if (map && map.getLayer(LAYER_ID)) {
    try { map.removeLayer(LAYER_ID) } catch { /* noop */ }
  }
  if (_map === map) _map = null
}

// Rebuild the car mesh when the vehicle profile changes.
export function refreshChaseVehicleProfile(map) {
  if (!map || !map.getLayer(LAYER_ID)) return
  removeChaseVehicleLayer(map)
  addChaseVehicleLayer(map)
}

function applyProfile(impl) {
  if (!impl?.scene || !impl?.car) return
  impl.scene.remove(impl.car)
  impl.car = buildCar()
  impl.scene.add(impl.car)
}

// ── Car model (meters, ENU: +Y = nose direction) ───────────────────────────
function buildCar() {
  const p = PROFILE_PAINT[_profile] ?? PROFILE_PAINT.sport
  const car = new THREE.Group()

  const paint = new THREE.MeshPhysicalMaterial({
    color: p.color,
    metalness: 0.85,
    roughness: p.roughness,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
  })
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a101c, metalness: 1.0, roughness: 0.08, clearcoat: 1,
  })
  const trim = new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.7, metalness: 0.3 })
  const tire = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 })
  const hub  = new THREE.MeshStandardMaterial({ color: 0x9aa4b5, roughness: 0.35, metalness: 0.9 })

  const ride = p.ride
  const box = (w, l, h, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, l, h), mat)
    mesh.position.set(x, y, z)
    car.add(mesh)
    return mesh
  }

  // Hull — main body
  const hullH = p.boxy ? 0.78 : 0.62
  box(1.9, 4.6, hullH, 0, 0, 0.55 + ride + hullH / 2 - 0.31, paint)

  // Hood (front, +Y) and trunk (rear, −Y)
  box(1.84, 1.45, 0.30, 0,  1.55, 0.98 + ride, paint)
  box(1.84, 1.05, 0.36, 0, -1.75, 1.00 + ride, paint)

  // Cabin — glasshouse
  const cabH = p.boxy ? 0.85 : 0.52
  const cabL = p.boxy ? 2.7 : 2.05
  box(1.58, cabL, cabH, 0, p.boxy ? -0.35 : -0.25, 1.28 + ride + cabH / 2 - 0.26, glass)
  // Roof skin
  box(1.5, cabL * 0.92, 0.07, 0, p.boxy ? -0.35 : -0.25, 1.28 + ride + cabH - 0.22, paint)

  // Side skirts + bumpers
  box(1.94, 4.2, 0.16, 0, 0, 0.22 + ride, trim)
  box(1.92, 0.35, 0.42, 0,  2.28, 0.62 + ride, trim)  // front bumper
  box(1.92, 0.35, 0.46, 0, -2.28, 0.64 + ride, trim)  // rear bumper

  // Wheels
  const wheelR = p.boxy ? 0.40 : 0.34
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.30, 20)
  wheelGeo.rotateZ(Math.PI / 2)
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.32, 12)
  hubGeo.rotateZ(Math.PI / 2)
  const wy = p.boxy ? 1.55 : 1.45
  ;[[0.88, wy], [-0.88, wy], [0.88, -wy], [-0.88, -wy]].forEach(([x, y]) => {
    const w = new THREE.Mesh(wheelGeo, tire)
    w.position.set(x, y, wheelR + ride * 0.5)
    car.add(w)
    const hb = new THREE.Mesh(hubGeo, hub)
    hb.position.set(x, y, wheelR + ride * 0.5)
    car.add(hb)
  })

  // Headlights — cool white-blue emissive
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xdff4ff, emissive: 0xbfe9ff, emissiveIntensity: 2.2,
  })
  box(0.36, 0.08, 0.12,  0.58, 2.30, 0.80 + ride, headMat)
  box(0.36, 0.08, 0.12, -0.58, 2.30, 0.80 + ride, headMat)

  // Taillight bar — signature red strip, the chase-cam hero detail
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x550000, emissive: 0xff2a44, emissiveIntensity: 2.6,
  })
  box(1.52, 0.07, 0.10, 0, -2.31, 0.88 + ride, tailMat)

  // Sport spoiler
  if (!p.boxy) {
    box(1.66, 0.34, 0.06, 0, -2.18, 1.42 + ride, paint)
    box(0.08, 0.08, 0.30,  0.6, -2.18, 1.26 + ride, trim)
    box(0.08, 0.08, 0.30, -0.6, -2.18, 1.26 + ride, trim)
  }

  // Blob shadow (fake AO under the car)
  const shadowTex = radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)')
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 5.6),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 })
  )
  shadow.rotation.x = 0 // plane is XY; we need it flat in ENU → rotate to lie in XY? PlaneGeometry lies in XY already = ground plane in ENU. ✓
  shadow.position.set(0, 0, 0.02)
  shadow.renderOrder = 1
  car.add(shadow)

  // Cyan underglow
  if (p.glow > 0.01) {
    const glowTex = radialTexture('rgba(0,212,255,0.85)', 'rgba(0,212,255,0)')
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 6.0),
      new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: p.glow,
      })
    )
    glow.position.set(0, 0, 0.05)
    glow.renderOrder = 2
    car.add(glow)
  }

  return car
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64)
  grad.addColorStop(0, inner)
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  return tex
}
