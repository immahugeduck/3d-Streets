import { useEffect, useRef } from 'react'
import useStore from '../store/appStore'

// Greencastle, IN — user's home area fallback
const HOME_LOCATION = { lat: 39.6448, lng: -86.8647 }

async function getIPLocation() {
  try {
    const res = await fetch('https://ipapi.co/json/')
    if (!res.ok) return null
    const data = await res.json()
    if (data.latitude && data.longitude) {
      return { lat: data.latitude, lng: data.longitude }
    }
  } catch {
    // silently fall through
  }
  return null
}

export function useLocation() {
  const setUserLocation = useStore(s => s.setUserLocation)
  const setUserHeading  = useStore(s => s.setUserHeading)
  const setSpeedMPH     = useStore(s => s.setSpeedMPH)
  const watchId = useRef(null)
  const gotRealGPS = useRef(false)

  useEffect(() => {
    // Set home location immediately so map/search works before GPS resolves
    setUserLocation(HOME_LOCATION)

    // Try to improve with IP-based location while waiting for GPS
    getIPLocation().then(ipLoc => {
      if (ipLoc && !gotRealGPS.current) {
        console.log('[v0] IP location resolved:', ipLoc)
        setUserLocation(ipLoc)
      }
    })

    if (!navigator.geolocation) return

    const options = {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000,
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed, heading } = pos.coords
        gotRealGPS.current = true
        setUserLocation({ lat: latitude, lng: longitude })
        if (speed !== null && speed >= 0) {
          setSpeedMPH(speed * 2.23694)
        }
        if (heading !== null) {
          setUserHeading(heading)
        }
      },
      (err) => {
        console.warn('[v0] Geolocation error (code', err.code, '):', err.message)
        // If GPS is denied/unavailable, IP location is already set above
      },
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
