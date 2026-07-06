import {
  createContext, useContext, useEffect, useState,
  type ReactNode,
} from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { themes, type Theme } from './tokens'

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'leetgame_theme'

const ThemeCtx = createContext<Theme>(themes.light)
const ThemePrefCtx = createContext<{
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
}>({ preference: 'system', setPreference: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'system' || v === 'light' || v === 'dark') {
          setPreferenceState(v)
        }
      })
      .catch(() => {})
  }, [])

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p)
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {})
  }

  const theme =
    preference === 'system'
      ? scheme === 'dark'
        ? themes.dark
        : themes.light
      : themes[preference]

  return (
    <ThemePrefCtx.Provider value={{ preference, setPreference }}>
      <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>
    </ThemePrefCtx.Provider>
  )
}

export function useTheme(): Theme {
  return useContext(ThemeCtx)
}

export function useThemePreference() {
  return useContext(ThemePrefCtx)
}
