import { useState, useEffect } from 'react'

export type Theme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'leetgame_theme'

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

function applyTheme(theme: Theme) {
  const classList = document.documentElement.classList
  if (theme === 'dark') {
    classList.add('dark')
    classList.remove('light')
  } else if (theme === 'light') {
    classList.add('light')
    classList.remove('dark')
  } else {
    // 'system': remove both classes so the CSS @media (prefers-color-scheme) takes over
    classList.remove('dark')
    classList.remove('light')
  }
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(readStored)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* ignore */
    }
  }

  return { theme, setTheme }
}
