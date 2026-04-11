# Day 1 Cleanup Changelog

## Summary
Completed repository declogging and baseline dependency hygiene for the Week 1 stability sprint.

## Files Removed
- src/AICopilot.jsx
- api/anthropic.ts

## Files Updated
- package.json
- src/store/appStore.js

## Dependency Changes
Removed unused runtime dependencies from package.json:
- @mapbox/mapbox-gl-directions
- lucide-react
- clsx

## Code Hygiene Fixes
- Removed stray trailing shell text from src/store/appStore.js.

## Validation Notes
- Workspace search shows no references to removed files.
- Canonical AI API path remains /api/ai.
- Canonical AI UI component remains src/components/AI/AICopilot.jsx.

## Follow-Up
- Run `npm install` to refresh package-lock.json from updated package.json.
- Run `npm run build` and a quick smoke test after lockfile refresh.
