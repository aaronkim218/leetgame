import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { ThemeProvider } from '@/theme/theme-context'

const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo, push: jest.fn() }),
}))

const mockAuth = {
  session: { access_token: 't' } as unknown,
  activeTopics: ['Array', 'Graph'],
  persistTopics: jest.fn(),
}
jest.mock('@/auth/auth-context', () => ({ useAuth: () => mockAuth }))
jest.mock('@/api/proficiency', () => ({ getProficiency: jest.fn() }))
jest.mock('@/api/problems', () => ({ getProblemTags: jest.fn() }))

import StatsScreen from './stats'
import { getProficiency } from '@/api/proficiency'
import { getProblemTags } from '@/api/problems'

const proficiencyRows = [
  // Graph avg 0.8 (strong), Array avg 0.3 (weak) → Array card first
  {
    user_id: 'u',
    topic: 'Graph',
    stage: 'pattern',
    score: 0.8,
    updated_at: '',
  },
  {
    user_id: 'u',
    topic: 'Array',
    stage: 'pattern',
    score: 0.2,
    updated_at: '',
  },
  {
    user_id: 'u',
    topic: 'Array',
    stage: 'algorithm',
    score: 0.4,
    updated_at: '',
  },
]
const tags = [
  { name: 'Array', count: 5 },
  { name: 'Graph', count: 3 },
  { name: 'Tree', count: 2 },
]

function renderScreen() {
  return render(
    <ThemeProvider>
      <StatsScreen />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  mockDismissTo.mockClear()
  mockAuth.session = { access_token: 't' }
  mockAuth.activeTopics = ['Array', 'Graph']
  mockAuth.persistTopics.mockClear()
  ;(getProficiency as jest.Mock).mockResolvedValue(proficiencyRows)
  ;(getProblemTags as jest.Mock).mockResolvedValue(tags)
})

test('signed out shows the sign-in prompt and fetches nothing', async () => {
  mockAuth.session = null
  const { getByTestId } = await renderScreen()
  expect(getByTestId('stats-sign-in')).toBeTruthy()
  expect(getProficiency).not.toHaveBeenCalled()
})

test('renders topic cards weakest-first with stage rows', async () => {
  const { getAllByTestId, getByText } = await renderScreen()
  await waitFor(() =>
    expect(getAllByTestId(/^stats-topic-card-/)).toHaveLength(2),
  )
  const cards = getAllByTestId(/^stats-topic-card-/)
  expect(cards[0].props.testID).toBe('stats-topic-card-Array')
  expect(cards[1].props.testID).toBe('stats-topic-card-Graph')
  expect(getByText('20%')).toBeTruthy()
  expect(getByText('Algorithm')).toBeTruthy()
})

test('toggling a topic chip persists the new topic list', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('stats-manage-topics')).toBeTruthy())
  await fireEvent.press(getByTestId('stats-manage-topics'))
  fireEvent.press(getByTestId('stats-topic-chip-Tree'))
  expect(mockAuth.persistTopics).toHaveBeenCalledWith([
    'Array',
    'Graph',
    'Tree',
  ])
})

test('the last active topic chip is disabled', async () => {
  mockAuth.activeTopics = ['Array']
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('stats-manage-topics')).toBeTruthy())
  await fireEvent.press(getByTestId('stats-manage-topics'))
  fireEvent.press(getByTestId('stats-topic-chip-Array'))
  expect(mockAuth.persistTopics).not.toHaveBeenCalled()
})

test('smart practice button dismisses to the practice screen with a nonce', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('stats-smart-practice')).toBeTruthy())
  fireEvent.press(getByTestId('stats-smart-practice'))
  expect(mockDismissTo).toHaveBeenCalledWith({
    pathname: '/',
    params: { smart: expect.any(String) },
  })
})

test('empty proficiency shows the practice prompt', async () => {
  ;(getProficiency as jest.Mock).mockResolvedValue([])
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('stats-empty')).toBeTruthy())
})

test('fetch failure shows the error state', async () => {
  ;(getProficiency as jest.Mock).mockRejectedValue(new Error('boom'))
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('stats-error')).toBeTruthy())
})
