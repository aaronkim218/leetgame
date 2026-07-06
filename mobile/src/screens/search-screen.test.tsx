import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { ThemeProvider } from '@/theme/theme-context'
import { takePendingPlaylist } from '@/practice/pending-playlist'

const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo }),
}))

const mockAuth = { session: { access_token: 't' } as unknown }
jest.mock('@/auth/auth-context', () => ({ useAuth: () => mockAuth }))

jest.mock('@/api/problems', () => ({
  searchProblems: jest.fn(),
  getProblemTags: jest.fn(),
}))

const mockSaved = {
  savedProblems: [] as unknown[],
  savedIds: new Set<string>(),
  save: jest.fn(),
  unsave: jest.fn(),
  isSaved: (id: string) => mockSaved.savedIds.has(id),
}
jest.mock('@/saved/use-saved', () => ({ useSaved: () => mockSaved }))

import SearchScreen from './search-screen'
import { searchProblems, getProblemTags } from '@/api/problems'

const problems = [
  {
    id: 'p1',
    slug: 'two-sum',
    title: 'Two Sum',
    description: 'D',
    difficulty: 'Easy',
    topic_tags: ['Array'],
    leetcode_id: 1,
  },
  {
    id: 'p2',
    slug: 'lru',
    title: 'LRU Cache',
    description: 'D',
    difficulty: 'Hard',
    topic_tags: ['Design'],
    leetcode_id: 146,
  },
]

function renderScreen() {
  return render(
    <ThemeProvider>
      <SearchScreen />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  mockDismissTo.mockClear()
  mockAuth.session = { access_token: 't' }
  mockSaved.savedProblems = []
  mockSaved.savedIds = new Set()
  mockSaved.save.mockClear()
  mockSaved.unsave.mockClear()
  takePendingPlaylist() // drain any leftover pending value
  ;(searchProblems as jest.Mock)
    .mockReset()
    .mockResolvedValue({ problems, page: 1, page_size: 12, total: 2 })
  ;(getProblemTags as jest.Mock).mockReset().mockResolvedValue([
    { name: 'Array', count: 5 },
    { name: 'Graph', count: 3 },
  ])
})

test('renders results after the debounced search', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-result-p1')).toBeTruthy(), {
    timeout: 3000,
  })
  expect(getByTestId('search-result-p2')).toBeTruthy()
})

test('tapping a result hands off a pending playlist and dismisses home', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-result-p1')).toBeTruthy(), {
    timeout: 3000,
  })
  fireEvent.press(getByTestId('search-result-p1'))
  expect(mockDismissTo).toHaveBeenCalledWith({
    pathname: '/',
    params: { playlist: expect.any(String) },
  })
  const pending = takePendingPlaylist()
  expect(pending?.problem?.id).toBe('p1')
  expect(pending?.filters).toEqual({
    q: '',
    difficulties: [],
    tags: [],
    tagMatch: 'and',
  })
})

test('difficulty filter resets to page 1 and is sent to the API', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(searchProblems).toHaveBeenCalled(), {
    timeout: 3000,
  })
  await fireEvent.press(getByTestId('search-difficulty-Easy'))
  await waitFor(
    () =>
      expect(
        (searchProblems as jest.Mock).mock.calls.at(-1)?.slice(0, 5),
      ).toEqual(['', ['Easy'], [], 'and', 1]),
    { timeout: 3000 },
  )
})

test('practice-these hands off the current filters without a problem', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-result-p1')).toBeTruthy(), {
    timeout: 3000,
  })
  await fireEvent.press(getByTestId('search-difficulty-Hard'))
  fireEvent.press(getByTestId('search-enter-playlist'))
  const pending = takePendingPlaylist()
  expect(pending?.problem).toBeUndefined()
  expect(pending?.filters.difficulties).toEqual(['Hard'])
  expect(mockDismissTo).toHaveBeenCalled()
})

test('star toggles saved state without navigating', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-save-p1')).toBeTruthy(), {
    timeout: 3000,
  })
  fireEvent.press(getByTestId('search-save-p1'))
  expect(mockSaved.save).toHaveBeenCalledWith(problems[0])
  expect(mockDismissTo).not.toHaveBeenCalled()
})

test('saved view lists saved problems and hands off empty filters', async () => {
  mockSaved.savedProblems = [problems[1]]
  mockSaved.savedIds = new Set(['p2'])
  const { getByTestId, queryByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-saved-toggle')).toBeTruthy())
  await fireEvent.press(getByTestId('search-saved-toggle'))
  await waitFor(() => expect(getByTestId('search-result-p2')).toBeTruthy(), {
    timeout: 3000,
  })
  expect(queryByTestId('search-enter-playlist')).toBeNull()
  fireEvent.press(getByTestId('search-result-p2'))
  const pending = takePendingPlaylist()
  expect(pending?.problem?.id).toBe('p2')
  expect(pending?.filters).toEqual({
    q: '',
    difficulties: [],
    tags: [],
    tagMatch: 'and',
  })
})

test('anonymous users see no stars and no saved toggle', async () => {
  mockAuth.session = null
  const { getByTestId, queryByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-result-p1')).toBeTruthy(), {
    timeout: 3000,
  })
  expect(queryByTestId('search-saved-toggle')).toBeNull()
  expect(queryByTestId('search-save-p1')).toBeNull()
})

test('pagination requests the next page', async () => {
  ;(searchProblems as jest.Mock).mockResolvedValue({
    problems,
    page: 1,
    page_size: 12,
    total: 30,
  })
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-next')).toBeTruthy(), {
    timeout: 3000,
  })
  await fireEvent.press(getByTestId('search-next'))
  await waitFor(
    () => expect((searchProblems as jest.Mock).mock.calls.at(-1)?.[4]).toBe(2),
    { timeout: 3000 },
  )
})

test('search failure shows the error state', async () => {
  ;(searchProblems as jest.Mock).mockRejectedValue(new Error('boom'))
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-error')).toBeTruthy(), {
    timeout: 3000,
  })
})

test('adding a tag from the options sends it to the API', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(
    () => expect(getByTestId('search-tag-option-Array')).toBeTruthy(),
    {
      timeout: 3000,
    },
  )
  await fireEvent.press(getByTestId('search-tag-option-Array'))
  await waitFor(
    () =>
      expect(
        (searchProblems as jest.Mock).mock.calls.at(-1)?.slice(2, 4),
      ).toEqual([['Array'], 'and']),
    { timeout: 3000 },
  )
  expect(getByTestId('search-tag-selected-Array')).toBeTruthy()
})
