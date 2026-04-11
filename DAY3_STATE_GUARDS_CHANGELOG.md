# Day 3 State Guards Changelog

## Summary
Hardened global app state transitions to prevent stale navigation state, invalid phase changes, and AI chat runtime gaps.

## File Updated
- src/store/appStore.js

## Key Improvements

### 1) Added Navigation Reset Helper
- Introduced a shared reset patch used by multiple lifecycle actions.
- Ensures consistent cleanup of:
  - route options/selection
  - route steps and indexes
  - reroute flags
  - sidebar and stops panel visibility
  - selected stop and route lock state

### 2) Phase Guarding
- `setPhase` now ignores invalid phase values.

### 3) Destination and Waypoint Guards
- `setDestination` now validates destination shape and resets stale navigation state before entering route preview.
- `setDestinationOnly` validates destination shape.
- `setWaypoints` sanitizes non-array input.
- `addWaypoint` validates coordinate shape, de-duplicates by id, and enforces a max waypoint cap.
- `removeWaypoint` now clears `selectedStop` if the removed waypoint was selected.

### 4) Route Data Safety
- `setRouteOptions` sanitizes non-array input.
- `setSelectedRoute` now syncs `routeSteps` from selected route and resets step index.
- `setRouteSteps` sanitizes input and clamps step index to bounds.
- `setCurrentStepIndex` now clamps index into valid route step bounds.
- `setLegStats` sanitizes non-array input.

### 5) Navigation Lifecycle Hardening
- `startNavigation` now requires destination + selected route.
- `startNavigation` safely hydrates steps from selected route if needed.
- `endNavigation` and `advanceLeg` completion both use the same reset helper.

### 6) AI Store Runtime Completeness
- Added missing AI state fields used by UI:
  - `aiMessages`
  - `aiThinking`
- Added missing AI actions used by UI:
  - `addAIMessage`
  - `setAIThinking`
  - `clearAIChat`
- This prevents runtime failures when opening AI copilot.

### 7) AI Open/Close Phase Safety
- `openAI` preserves a safe non-AI previous phase.
- `closeAI` now avoids returning to AI phase and falls back to IDLE when needed.

## Validation
- Diagnostics report no errors in touched files.
