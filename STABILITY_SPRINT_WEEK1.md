# 3D Streets - Week 1 Stability Sprint

## Goal
Ship a reliability-focused release by tightening runtime safety, API consistency, and basic test coverage for the core navigation flow.

## Scope
- Stabilize map + navigation state transitions.
- Harden AI proxy behavior and observability.
- Remove dead/duplicate paths that cause confusion.
- Add baseline automated tests for critical logic.

## Non-Goals (This Week)
- New major product features (voice assistant, trip history, route sharing).
- Visual redesign work.
- Deep performance rewrites.

## Success Criteria
- No duplicate AI backend paths in production code.
- Core happy path passes manual smoke test:
  search -> route preview -> start nav -> open AI copilot -> add stop.
- At least 10 targeted unit tests passing for store/service logic.
- No high-severity console errors during the happy-path flow.

## Day-by-Day Plan

### Day 1 - Repo Hygiene + Dependency Sanity
- Remove duplicate or unused files and stale entry points.
- Verify no imports reference deleted files.
- Run dependency check and remove unused packages if any are found.
- Output: clean tree and a short "removed files" changelog.

### Day 2 - AI Path Hardening
- Keep only one backend AI route contract (`/api/ai`).
- Standardize model/env handling and error responses.
- Add request-level logging metadata (action, status, duration, error type).
- Output: deterministic AI error surface in UI with actionable messages.

### Day 3 - State Safety and Navigation Guards
- Audit `appStore` transitions for edge cases:
  - rapid phase switching
  - end-navigation reset completeness
  - waypoint/destination mutation while navigating
- Add defensive guards where state can become inconsistent.
- Output: predictable state transitions with no stale route artifacts.

### Day 4 - Map Runtime Resilience
- Add failure handling around map style/layer reload race conditions.
- Ensure route redraw is idempotent across style changes.
- Improve geolocation error handling and permission-denied UX.
- Output: map remains usable after style toggles and transient failures.

### Day 5 - Testing + Release Gate
- Add unit tests for:
  - distance/duration formatting
  - route parsing behavior
  - critical store actions and resets
- Add one lightweight integration smoke script/checklist.
- Output: baseline CI-ready reliability checks.

## Test Plan

## 1) Unit Tests
- `mapboxService`: `formatDist`, `formatDur`, `parseDirectionsResponse` expectations.
- `appStore`: phase transitions, navigation reset, waypoint operations.
- `anthropicService`: timeout and non-200 response handling.

## 2) Manual Smoke (Desktop + Mobile)
- Set destination from search results.
- Open route preview and start navigation.
- Toggle map style and traffic while navigating.
- Open AI copilot and issue one waypoint request.
- End navigation and confirm full state reset.

## 3) Regression Checks
- No broken imports after cleanup.
- No duplicate API calls for single user action.
- No uncaught promise rejections in console.

## Risks and Mitigations
- Risk: hidden coupling to deleted files.
  - Mitigation: workspace grep + build after cleanup.
- Risk: map style reload races causing missing layers.
  - Mitigation: idempotent add/remove helpers and guards.
- Risk: AI provider timeout spikes.
  - Mitigation: clear timeout UX + retry guidance.

## Deliverables by End of Week
- Cleaned project structure with duplicate files removed.
- Stability fixes merged for store/map/AI paths.
- Test suite additions with passing results.
- Short release note summarizing reliability improvements.