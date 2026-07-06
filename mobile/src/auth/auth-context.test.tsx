import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import { AuthProvider, useAuth } from './auth-context'

const authState = { callback: (_e: string, _s: unknown) => {} }
jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        authState.callback = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: jest.fn(),
    },
  },
}))
jest.mock(
  '../api/streak',
  () => ({ getStreak: jest.fn(), recordStreak: jest.fn() }),
  { virtual: true },
)
jest.mock(
  '../api/settings',
  () => ({ getSettings: jest.fn(), updateSettings: jest.fn(async () => {}) }),
  { virtual: true },
)

function Probe() {
  const { authReady, activeStages, hideTitle } = useAuth()
  return <Text>{`${authReady}|${activeStages.join(',')}|${hideTitle}`}</Text>
}

test('anonymous session falls back to default settings', async () => {
  const { getByText } = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  await act(async () => {
    authState.callback('INITIAL_SESSION', null)
  })
  await waitFor(() =>
    expect(getByText('true|pattern,algorithm,tc_sc|true')).toBeTruthy(),
  )
})

import { getSettings, updateSettings } from '../api/settings'
import { getStreak } from '../api/streak'
import { Pressable } from 'react-native'

function PersistProbe() {
  const {
    conciseMode,
    activeTopics,
    persistConciseMode,
    persistStages,
    persistTopics,
  } = useAuth()
  return (
    <>
      <Text testID="concise">{String(conciseMode)}</Text>
      <Text testID="topics">{activeTopics.join(',')}</Text>
      <Pressable
        testID="toggle-concise"
        onPress={() => persistConciseMode(true)}
      />
      <Pressable
        testID="set-stages"
        onPress={() => persistStages(['pattern'])}
      />
      <Pressable
        testID="set-topics"
        onPress={() => persistTopics(['Array', 'Graph'])}
      />
    </>
  )
}

test('signed-in persistConciseMode PUTs merged settings', async () => {
  ;(getSettings as jest.Mock).mockResolvedValue({
    active_stages: ['pattern', 'algorithm'],
    hide_title: false,
    hide_difficulty: true,
    concise_mode: false,
    active_topics: ['Array'],
    tour_done: true,
  })
  ;(getStreak as jest.Mock).mockResolvedValue({
    streak: 1,
    last_practiced_at: null,
  })
  const { getByTestId } = await render(
    <AuthProvider>
      <PersistProbe />
    </AuthProvider>,
  )
  await act(async () => {
    authState.callback('SIGNED_IN', { access_token: 't' })
  })
  await waitFor(() => expect(getByTestId('concise').children[0]).toBe('false'))

  await act(async () => {
    fireEvent.press(getByTestId('toggle-concise'))
  })
  expect(getByTestId('concise').children[0]).toBe('true')
  expect(updateSettings).toHaveBeenCalledWith(
    ['pattern', 'algorithm'], // stages unchanged
    false, // hide_title from fetched settings
    true, // hide_difficulty from fetched settings
    true, // the new concise value
    ['Array'], // topics round-tripped
    true, // tour_done round-tripped
  )
})

test('anonymous persistStages updates state without a PUT', async () => {
  ;(updateSettings as jest.Mock).mockClear()
  const { getByTestId } = await render(
    <AuthProvider>
      <PersistProbe />
    </AuthProvider>,
  )
  await act(async () => {
    authState.callback('INITIAL_SESSION', null)
  })
  await act(async () => {
    fireEvent.press(getByTestId('set-stages'))
  })
  expect(updateSettings).not.toHaveBeenCalled()
})

test('failed settings load: toggle updates state but skips the PUT', async () => {
  ;(updateSettings as jest.Mock).mockClear()
  ;(getSettings as jest.Mock).mockRejectedValue(new Error('network'))
  ;(getStreak as jest.Mock).mockResolvedValue({
    streak: 1,
    last_practiced_at: null,
  })
  const { getByTestId } = await render(
    <AuthProvider>
      <PersistProbe />
    </AuthProvider>,
  )
  await act(async () => {
    authState.callback('SIGNED_IN', { access_token: 't' })
  })
  await act(async () => {
    fireEvent.press(getByTestId('toggle-concise'))
  })
  expect(getByTestId('concise').children[0]).toBe('true')
  expect(updateSettings).not.toHaveBeenCalled()
})

test('persistTopics PUTs the new topics with other settings round-tripped', async () => {
  ;(updateSettings as jest.Mock).mockClear()
  ;(getSettings as jest.Mock).mockResolvedValue({
    active_stages: ['pattern', 'algorithm'],
    hide_title: false,
    hide_difficulty: true,
    concise_mode: false,
    active_topics: ['Array'],
    tour_done: true,
  })
  ;(getStreak as jest.Mock).mockResolvedValue({
    streak: 1,
    last_practiced_at: null,
  })
  const { getByTestId } = await render(
    <AuthProvider>
      <PersistProbe />
    </AuthProvider>,
  )
  await act(async () => {
    authState.callback('SIGNED_IN', { access_token: 't' })
  })
  await waitFor(() => expect(getByTestId('topics').children[0]).toBe('Array'))

  await act(async () => {
    fireEvent.press(getByTestId('set-topics'))
  })
  expect(getByTestId('topics').children[0]).toBe('Array,Graph')
  expect(updateSettings).toHaveBeenCalledWith(
    ['pattern', 'algorithm'],
    false,
    true,
    false,
    ['Array', 'Graph'],
    true,
  )
})
