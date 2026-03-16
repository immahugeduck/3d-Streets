import { useEffect, useRef } from 'react'
import useStore from '../store/appStore'

export function useLocation() {
  const setUserLocation = useStore(s => s.setUserLocation)
  const setUserHeading  = useStore(s => s.setUserHeading)
  const setSpeedMPH     = useStore(s => s.setSpeedMPH)
  const watchId = useRef(null)

  useEffect(() => {
    if (!navigator.geolocation) return

    const options = {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000,
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed, heading } = pos.coords
        setUserLocation({ lat: latitude, lng: longitude })
        if (speed !== null && speed >= 0) {
          setSpeedMPH(speed * 2.23694)
        }
        if (heading !== null) {
          setUserHeading(heading)
        }
      },
      (err) => console.warn('Geolocation error:', err),
      options
    )

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
      }
    }
  }, [])
}

// One-shot get location
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 8000 }
    )
  })
}
