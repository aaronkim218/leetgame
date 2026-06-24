import { render, waitFor } from '@testing-library/react-native'
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
jest.mock('../api/streak', () => ({ getStreak: jest.fn(), recordStreak: jest.fn() }), { virtual: true })
jest.mock('../api/settings', () => ({ getSettings: jest.fn() }), { virtual: true })

function Probe() {
  const { authReady, activeStages, hideTitle } = useAuth()
  return (
    <Text>{`${authReady}|${activeStages.join(',')}|${hideTitle}`}</Text>
  )
}

test('anonymous session falls back to default settings', async () => {
  const { getByText } = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  authState.callback('INITIAL_SESSION', null)
  await waitFor(() =>
    expect(getByText('true|pattern,algorithm,tc_sc|true')).toBeTruthy(),
  )
})
