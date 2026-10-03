import { useRef } from 'react'
import useStore from '../store/appStore'

// Steering angle derived from heading changes — smoothed and clamped like
// a real wheel. Drives the Forza-style steering wheels (cockpit overlay,
// idle game shell).
export function useSteeringAngle() {
  const userHeading = useStore(s => s.userHeading)
  const steerRef = useRef(0)
  const prevHeadingRef = useRef(null)

  let steering = steerRef.current
  if (Number.isFinite(userHeading)) {
    const prev = prevHeadingRef.current
    if (prev !== null && prev !== undefined) {
      let d = userHeading - prev
      d = ((d + 540) % 360) - 180
      steering = Math.max(-90, Math.min(90, steering * 0.72 + d * 5))
      steerRef.current = steering
    }
    prevHeadingRef.current = userHeading
  }
  return steering
}
