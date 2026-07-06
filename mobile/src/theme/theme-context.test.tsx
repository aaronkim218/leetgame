jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'
import { ThemeProvider, useTheme, useThemePreference } from './theme-context'
import { themes } from './tokens'

function Probe() {
  const theme = useTheme()
  const { preference, setPreference } = useThemePreference()
  return (
    <>
      <Text testID="bg">{theme.background}</Text>
      <Text testID="pref">{preference}</Text>
      <Pressable testID="set-dark" onPress={() => setPreference('dark')} />
    </>
  )
}

test('setPreference overrides the OS scheme and persists to AsyncStorage', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
  // jest-expo's useColorScheme mock returns 'light', so system → light bg
  expect(getByTestId('bg').children[0]).toBe(themes.light.background)

  await act(async () => {
    fireEvent.press(getByTestId('set-dark'))
  })
  expect(getByTestId('pref').children[0]).toBe('dark')
  expect(getByTestId('bg').children[0]).toBe(themes.dark.background)
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('leetgame_theme', 'dark')
})

test('loads a stored preference on mount', async () => {
  await AsyncStorage.setItem('leetgame_theme', 'dark')
  const { getByTestId } = await render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
  await waitFor(() =>
    expect(getByTestId('bg').children[0]).toBe(themes.dark.background),
  )
})
