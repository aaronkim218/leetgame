import { themes } from './tokens'

test('light and dark themes expose all token keys', () => {
  const keys = [
    'background',
    'foreground',
    'card',
    'primary',
    'primaryForeground',
    'secondary',
    'secondaryForeground',
    'muted',
    'mutedForeground',
    'border',
    'destructive',
    'codeBg',
    'easy',
    'medium',
    'hard',
  ] as const
  for (const name of ['light', 'dark'] as const) {
    for (const k of keys) {
      expect(typeof themes[name][k]).toBe('string')
      expect(themes[name][k].length).toBeGreaterThan(0)
    }
  }
})

test('primary differs between light and dark', () => {
  expect(themes.light.primary).toBe('#aa3bff')
  expect(themes.dark.primary).toBe('#c084fc')
})
