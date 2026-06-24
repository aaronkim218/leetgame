export type ThemeName = 'light' | 'dark'

export interface Theme {
  background: string
  foreground: string
  card: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  border: string
  destructive: string
  codeBg: string
  easy: string
  medium: string
  hard: string
}

export const themes: Record<ThemeName, Theme> = {
  light: {
    background: '#fff',
    foreground: '#08060d',
    card: '#fff',
    primary: '#aa3bff',
    primaryForeground: '#fff',
    secondary: '#f0f0f0',
    secondaryForeground: '#222',
    muted: '#f4f3ec',
    mutedForeground: '#6b6375',
    border: '#e5e4e7',
    destructive: '#ff375f',
    codeBg: '#eaecf4',
    easy: '#00b8a9',
    medium: '#ffc01e',
    hard: '#ff375f',
  },
  dark: {
    background: '#16171d',
    foreground: '#f3f4f6',
    card: '#16171d',
    primary: '#c084fc',
    primaryForeground: '#fff',
    secondary: '#2e303a',
    secondaryForeground: '#f3f4f6',
    muted: '#1f2028',
    mutedForeground: '#9ca3af',
    border: '#2e303a',
    destructive: '#ff375f',
    codeBg: '#2a2d3e',
    easy: '#00b8a9',
    medium: '#ffc01e',
    hard: '#ff375f',
  },
}
