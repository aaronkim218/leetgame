import { useState, useEffect } from 'react'

const UNAUTH_TOUR_KEY = 'leetgame_tour_dismissed'

export function useTour(
  isAuth: boolean,
  settingsReady: boolean,
  tourDone: boolean,
  persistTourDone: () => void,
) {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (isAuth) {
      // wait for settings to load before showing — avoids flash when tourDone is still false
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (settingsReady) setShowBanner(!tourDone)
    } else {
      setShowBanner(localStorage.getItem(UNAUTH_TOUR_KEY) !== 'true')
    }
  }, [isAuth, settingsReady, tourDone])

  const dismiss = () => {
    setShowBanner(false)
    if (isAuth) {
      persistTourDone()
    } else {
      localStorage.setItem(UNAUTH_TOUR_KEY, 'true')
    }
  }

  const markDone = () => {
    setShowBanner(false)
    if (isAuth) {
      persistTourDone()
    } else {
      localStorage.setItem(UNAUTH_TOUR_KEY, 'true')
    }
  }

  return { showBanner, dismiss, markDone }
}
