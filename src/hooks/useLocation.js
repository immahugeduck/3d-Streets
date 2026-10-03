import { useEffect, useRef } from 'react'
import useStore from '../store/appStore'

// Greencastle, IN — user's home area fallback
const HOME_LOCATION = { lat: 39.6448, lng: -86.8647 }

async function getIPLocation() {
  try {
    // Use Mapbox's temporary geocoding endpoint to get IP-based location
    const token = import.meta.env.VITE_MAPBOX_TOKEN || ''
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/ip.json?access_token=${token}&types=place`
    )
    if (!res.ok) return null
    const data = await res.json()
    const feature = data.features?.[0]
    if (feature?.geometry?.coordinates) {
      return {
        lat: feature.geometry.coordinates[1],
        lng: feature.geometry.coordinates[0],
      }
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
  const prevFix = useRef(null)

  useEffect(() => {
    // Set home location immediately so map/search works before GPS resolves
    setUserLocation(HOME_LOCATION)

    // Try to improve with IP-based location while waiting for GPS
    getIPLocation().then(ipLoc => {
      if (ipLoc && !gotRealGPS.current) {
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
        } else if (prevFix.current) {
          // No speed from GPS: if we haven't moved, we're stopped —
          // don't leave the last speed frozen on the speedometer.
          const dLat = (latitude - prevFix.current.lat) * 111320
          const dLng = (longitude - prevFix.current.lng) * 111320 *
            Math.cos((latitude * Math.PI) / 180)
          if (Math.hypot(dLat, dLng) < 3) setSpeedMPH(0)
        }
        prevFix.current = { lat: latitude, lng: longitude }
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
