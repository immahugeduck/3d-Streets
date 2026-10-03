// Shared maneuver → icon mapping (Forza-style turn glyphs).
// Single source of truth — previously copy-pasted across four components.

export const MANEUVER_ICONS = {
  'turn-left':         '↰',
  'turn-right':        '↱',
  'turn-slight-left':  '↖',
  'turn-slight-right': '↗',
  'turn-sharp-left':   '⬐',
  'turn-sharp-right':  '⬏',
  'off-ramp-left':     '⬐',
  'off-ramp-right':    '⬏',
  'uturn':             '↩',
  'roundabout':        '↻',
  'merge':             '⤵',
  'arrive':            '📍',
  'depart':            '🚀',
  'straight':          '↑',
  'default':           '↑',
}

export function getManeuverIcon(type, modifier) {
  if (!type) return '↑'
  const key = modifier ? `${type}-${modifier}`.replace(/ /g, '-') : type
  return MANEUVER_ICONS[key] ?? MANEUVER_ICONS[type] ?? MANEUVER_ICONS.default
}
