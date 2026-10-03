# Forza Motorsport 6 — Navigation Styling Guide

**Research basis:** Forza Motorsport 5 (2013) and Forza Motorsport 6 (2015),
Xbox One. Full research report: `~/workspace/forza-nav-ui-spec.md`.
**Skin target:** FM6 (same HUD language as FM5, better road rendering, rain
system, refined speed cluster).

> All styling is *Forza-inspired*. No Forza assets, fonts, logos, or
> trademarks are used or reproduced. Hex values are approximations from
> screenshots — tune visually.

## 1. Design tokens

```css
--forza-text: #ffffff;          /* primary HUD text */
--forza-text-dim: #9aa0a8;      /* dim labels */
--forza-shadow: 0 2px 6px rgba(0,0,0,0.65);   /* HUD legibility */
--forza-minimap-bg: rgba(10,10,12,0.55);      /* circular map fill */
--forza-ribbon: #c9cdd3;        /* minimap route ribbon */
--forza-player: #ffffff;        /* heading-up player triangle */
--forza-traffic: #ff7a1a;       /* opponent / POI dots */
--forza-suggest-blue: #2e9bff;  /* suggested line: accelerate */
--forza-suggest-red: #ff2a1a;   /* suggested line: brake ahead */
--forza-accent-red: #e10600;    /* brand accent */
```

Defined in `src/styles/design-system.css`. Typeface: **Barlow Condensed**
(closest public stand-in for Forza's condensed grotesque). All numerals use
`font-variant-numeric: tabular-nums`. Labels are uppercase with letter-spacing.

## 2. Minimap (bottom-left in FM6 → top-right corner here)

Copy FM6 1:1 — it's the single most Forza-identifiable element:

- Perfect **circle**, dark translucent fill `rgba(10,10,12,0.55)`, hairline ring.
- Route = thin (~3px) **flat white ribbon** `#c9cdd3` — no glow, no shadow.
- Player = **white filled triangle, always pointing up** (heading-up: the world
  rotates under the fixed arrow).
- Saved places render as **orange dots** `#ff7a1a` (FM6's opponent dots).
- No chevrons, no turn numbers on the map, no effects.
- Implemented in `src/components/Navigation/NavMinimap.jsx` as a 2D canvas
  (~12 fps, heading-up projection, ~320 m ahead / ~130 m behind).

## 3. Chase camera (main nav POV)

- Sits ~2.5–3 car-lengths behind, slightly above roofline; car in the
  lower-center third, vanishing point near vertical center.
- **Yaws with the car's heading with damped lag** — the car visibly rotates
  through corners; this is the core of Forza's turning feel.
- **Speed response:** camera pulls back (zoom eases off) as speed rises.
  Subtle — no shake-fest, no vignette, no chromatic aberration (FM5/6 have
  none in chase cam).
- Implemented in `src/components/Navigation/chaseCamera.js`:
  shortest-arc bearing interpolation, ~24 m look-ahead, base zoom 18.6 → 17.6
  floor, pitch 64° (60° truck).

## 4. Suggested driving line → navigation route

FM6 projects a 3D ribbon on the road ahead: **blue = accelerate, red = brake**,
white when off-track. The nav route mirrors this:

- `route-severity` layer (`src/components/Map/MapView.jsx` →
  `updateRouteSeverity()`) colors the stretch from the car to the next
  maneuver: `#2e9bff` normally, `#ff2a1a` before sharp turns, uturns,
  roundabouts, and arrivals.
- Updated at nav tick rate (~4 Hz); clears when navigation ends.

## 5. Speed feedback

Forza's speed stack is camera + blur only: FOV ramp, pull-back, per-object
motion blur, subtle shake. No vignette.

- `SpeedFXOverlay` adds only faint edge streaks above ~35 mph, scaling to
  full at ~105 mph. Respects `prefers-reduced-motion`.
- Camera pull-back lives in `chaseCamera.js`.

## 6. Cockpit / hood views

- Cockpit: Forza-style 3-spoke steering wheel that rotates with steering
  input, plus a working gauge cluster — tach arc with redline zone, live
  needle driven by speed, digital speed readout, gear indicator
  (`CarHoodOverlay.jsx` → `SteeringWheel` / `Tachometer`).
- Hood: hood-only framing, wheel hidden.
- All drive settings (drive camera, vehicle profile, location icon) live in
  the Settings panel — nothing selectable floats over the map.
- FM6 authenticity notes for future work: 30 fps mirror render targets,
  rain droplets + wiper sweep, micro head-bob under braking.

## 7. What we deliberately did NOT copy

- Floating waypoint arrows / turn chevrons (that's Forza *Horizon*, not
  Motorsport — Motorsport communicates corners via the suggested line).
- Heavy post-processing: bloom kept to the route line's soft glow; no DoF,
  no film grain in gameplay views.

## 8. File map

| Concern | File |
|---|---|
| 3D chase vehicle | `src/components/Navigation/ChaseVehicleLayer.js` |
| Chase camera math | `src/components/Navigation/chaseCamera.js` |
| Corner minimap | `src/components/Navigation/NavMinimap.{jsx,module.css}` |
| Speed FX | `src/components/Navigation/SpeedFXOverlay.{jsx,module.css}` |
| Suggested-line layer | `updateRouteSeverity()` in `src/components/Map/MapView.jsx` |
| View-mode state | `driveCam` in `src/store/appStore.js` (`chase`/`cockpit`/`hood`) |
| Tokens | `src/styles/design-system.css` (`--forza-*`) |
