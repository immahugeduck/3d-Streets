import useStore from '../../store/appStore'
import styles from './SpeedFXOverlay.module.css'

// Forza-style speed feedback. Per the FM5/6 research: no vignette, no
// chromatic aberration in the chase cam — speed feel comes from camera
// pull-back + FOV + blur. So this overlay only adds faint motion streaks
// sweeping past the frame edges at speed, ramping in above ~35 mph.
// The camera pull-back itself is handled by chaseCamera.js.
export default function SpeedFXOverlay() {
  const speedMPH = useStore(s => s.speedMPH)

  const intensity = Math.min(1, Math.max(0, (speedMPH - 35) / 70))
  if (intensity <= 0.01) return null

  return (
    <div
      className={styles.fx}
      style={{ '--fx': intensity.toFixed(3) }}
      aria-hidden="true"
    >
      <div className={styles.streaks} />
    </div>
  )
}
