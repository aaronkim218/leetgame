import { createContext, useContext, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { themes, type Theme } from './tokens'

const ThemeCtx = createContext<Theme>(themes.light)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? themes.dark : themes.light
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>
}

export function useTheme(): Theme {
  return useContext(ThemeCtx)
}
