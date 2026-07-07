import { renderHook, act, waitFor } from '@testing-library/react-native'
import { usePracticeSession } from './use-practice-session'

const problem = {
  id: 'p1',
  slug: 's',
  title: 'T',
  description: 'D',
  difficulty: 'Easy' as const,
  topic_tags: [],
  leetcode_id: 1,
}

jest.mock('../api/problems', () => ({
  getRandomProblem: jest.fn(async () => problem),
  getSmartPracticeProblem: jest.fn(async () => problem),
  getRandomProblemFiltered: jest.fn(async () => problem),
}))

import {
  getRandomProblem,
  getSmartPracticeProblem,
  getRandomProblemFiltered,
} from '../api/problems'
import { ApiError } from '../api/errors'

const mockStreamScript: Array<{ type: string; [k: string]: unknown }> = []
const mockStreamChat = jest.fn()
jest.mock('../api/chat', () => ({
  streamChat: (...args: unknown[]) => mockStreamChat(...args),
}))

beforeEach(() => {
  mockStreamScript.length = 0
  mockStreamChat.mockClear()
  mockStreamChat.mockImplementation(async function* () {
    for (const e of mockStreamScript) yield e
  })
  ;(getRandomProblem as jest.Mock).mockClear()
  ;(getSmartPracticeProblem as jest.Mock).mockClear()
  ;(getRandomProblemFiltered as jest.Mock).mockClear()
  ;(getRandomProblemFiltered as jest.Mock).mockImplementation(
    async () => problem,
  )
})

test('loadRandom sets the problem and starts at the first active stage', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern', 'algorithm'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  expect(result.current.problem?.id).toBe('p1')
  expect(result.current.stage).toBe('pattern')
})

test('submit streams tokens then advances stage', async () => {
  mockStreamScript.push(
    { type: 'token', content: 'Good ' },
    { type: 'token', content: 'job' },
    { type: 'done', stage: 'algorithm', message: 'Good job' },
  )
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern', 'algorithm'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  await act(async () => {
    await result.current.submit('sliding window')
  })
  expect(result.current.stage).toBe('algorithm')
  expect(result.current.history).toEqual([
    { role: 'user', content: 'sliding window', marker: undefined },
    { role: 'assistant', content: 'Good job' },
  ])
})

test('calls onComplete when stage resolves to complete', async () => {
  mockStreamScript.push({ type: 'done', stage: 'complete', message: 'Nice' })
  const onComplete = jest.fn()
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete,
    }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  await act(async () => {
    await result.current.submit('answer')
  })
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
  expect(result.current.stage).toBe('complete')
})

test('submit passes conciseMode to streamChat', async () => {
  mockStreamScript.push({ type: 'done', stage: 'complete', message: 'ok' })
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: true,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  await act(async () => {
    await result.current.submit('hi')
  })
  // streamChat(problemId, stage, activeStages, history, message, hint, answer, concise, signal)
  expect(mockStreamChat.mock.calls[0][7]).toBe(true)
})

test('loadSmart marks the session smart and loadNext stays smart', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern', 'algorithm'],
      activeTopics: ['Array'],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadSmart()
  })
  expect(result.current.problemSource).toBe('smart')

  await act(async () => {
    await result.current.loadNext()
  })
  expect(getSmartPracticeProblem).toHaveBeenCalledTimes(2)
  expect(getSmartPracticeProblem).toHaveBeenLastCalledWith(
    ['pattern', 'algorithm'],
    ['Array'],
  )
  expect(getRandomProblem).not.toHaveBeenCalled()
})

test('loadRandom returns the session to random mode', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadSmart()
  })
  await act(async () => {
    await result.current.loadRandom()
  })
  expect(result.current.problemSource).toBe('random')

  await act(async () => {
    await result.current.loadNext()
  })
  // loadRandom's successor prefetch is already cached by the time loadNext
  // runs, so it's served from cache instead of a second getRandomProblem
  // call; the assertion that matters is that we didn't fall back to smart.
  expect(result.current.problemSource).toBe('random')
  expect(getRandomProblem).toHaveBeenCalledTimes(1)
  expect(getSmartPracticeProblem).toHaveBeenCalledTimes(1)
})

test('a newer load supersedes a stale in-flight load', async () => {
  let resolveSmart: (p: typeof problem) => void = () => {}
  ;(getSmartPracticeProblem as jest.Mock).mockImplementationOnce(
    () => new Promise((resolve) => (resolveSmart = resolve)),
  )
  const randomProblem = { ...problem, id: 'p-random' }
  ;(getRandomProblem as jest.Mock).mockResolvedValueOnce(randomProblem)

  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    const smartPromise = result.current.loadSmart() // stays pending
    await result.current.loadRandom() // initiated later, resolves first
    resolveSmart({ ...problem, id: 'p-smart' }) // stale result arrives late
    await smartPromise
  })
  expect(result.current.problem?.id).toBe('p-random')
  expect(result.current.problemSource).toBe('random')
})

const FILTERS = {
  q: 'sum',
  difficulties: ['Easy'],
  tags: ['Array'],
  tagMatch: 'and' as const,
}

test('startPlaylist with an initial problem starts there and prefetches the successor', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  const initial = { ...problem, id: 'p-init' }
  await act(async () => {
    await result.current.startPlaylist(FILTERS, initial)
  })
  expect(result.current.problem?.id).toBe('p-init')
  expect(result.current.problemSource).toBe('playlist')
  expect(result.current.playlistFilters).toEqual(FILTERS)
  // The initial problem itself isn't fetched, but its successor is
  // prefetched in the background so a later "Next" is instant.
  expect(getRandomProblemFiltered).toHaveBeenCalledTimes(1)
  expect(getRandomProblemFiltered).toHaveBeenCalledWith(
    'sum',
    ['Easy'],
    ['Array'],
    'and',
    'p-init',
  )
})

test('startPlaylist without a problem fetches a filtered random one', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS)
  })
  expect(result.current.problemSource).toBe('playlist')
  expect(getRandomProblemFiltered).toHaveBeenCalledWith(
    'sum',
    ['Easy'],
    ['Array'],
    'and',
    undefined,
  )
})

test('loadNext in playlist mode excludes the current problem', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS, { ...problem, id: 'p-cur' })
  })
  await act(async () => {
    await result.current.loadNext()
  })
  // The request excluding the current problem is the successor prefetch
  // fired by startPlaylist (call 1); loadNext consumes it from cache and
  // immediately fires a further successor prefetch (call 2, excluding the
  // newly-loaded problem instead).
  expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
    1,
    'sum',
    ['Easy'],
    ['Array'],
    'and',
    'p-cur',
  )
  expect(result.current.problem?.id).toBe('p1')
  expect(result.current.problemSource).toBe('playlist')
})

test('a 404 on next marks the set exhausted without an error', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  // startPlaylist's successor prefetch is the request that now needs to
  // 404 -- loadNext consumes the cached exhausted result synchronously
  // rather than hitting the network itself.
  ;(getRandomProblemFiltered as jest.Mock).mockRejectedValueOnce(
    new ApiError('no match', 404),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS, { ...problem, id: 'p-cur' })
  })
  await act(async () => {
    await result.current.loadNext()
  })
  expect(result.current.exhausted).toBe(true)
  expect(result.current.error).toBeNull()
  expect(result.current.problem?.id).toBe('p-cur')
})

test('restartPlaylist refetches without exclude and clears exhausted', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  // As above: the successor prefetch fired by startPlaylist is what needs
  // to 404 so loadNext consumes the cached exhausted result.
  ;(getRandomProblemFiltered as jest.Mock).mockRejectedValueOnce(
    new ApiError('no match', 404),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS, { ...problem, id: 'p-cur' })
  })
  await act(async () => {
    await result.current.loadNext()
  })
  expect(result.current.exhausted).toBe(true)
  await act(async () => {
    await result.current.restartPlaylist()
  })
  expect(result.current.exhausted).toBe(false)
  // Call 2 is restartPlaylist's own network fetch (no exclude); call 3 is
  // the successor prefetch it fires on success, so we assert by index
  // rather than "last called".
  expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
    2,
    'sum',
    ['Easy'],
    ['Array'],
    'and',
    undefined,
  )
})

test('loadRandom exits the playlist and clears its state', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS, { ...problem, id: 'p-cur' })
  })
  await act(async () => {
    await result.current.loadRandom()
  })
  expect(result.current.problemSource).toBe('random')
  expect(result.current.playlistFilters).toBeNull()
  await act(async () => {
    await result.current.loadNext()
  })
  // loadRandom's successor prefetch is already cached by the time loadNext
  // runs, so it's served from cache instead of a second getRandomProblem
  // call; the assertion that matters is that the session stayed random.
  expect(result.current.problemSource).toBe('random')
  expect(getRandomProblem).toHaveBeenCalledTimes(1)
})

test('entering smart mode clears playlist state', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS, { ...problem, id: 'p-cur' })
  })
  await act(async () => {
    await result.current.loadSmart()
  })
  expect(result.current.problemSource).toBe('smart')
  expect(result.current.playlistFilters).toBeNull()
})

const problem2 = { ...problem, id: 'p2', title: 'T2' }
const problem3 = { ...problem, id: 'p3', title: 'T3' }

const sessionOpts = {
  activeTopics: [],
  conciseMode: false,
}

test('loadNext consumes the prefetched problem without a second getRandomProblem call', async () => {
  ;(getRandomProblemFiltered as jest.Mock)
    .mockResolvedValueOnce(problem2)
    .mockResolvedValueOnce(problem3)
  const { result } = await renderHook(() =>
    usePracticeSession({
      ...sessionOpts,
      activeStages: ['pattern'],
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  await act(async () => {}) // flush the background prefetch
  await act(async () => {
    await result.current.loadNext()
  })
  expect(result.current.problem?.id).toBe('p2')
  expect(getRandomProblem).toHaveBeenCalledTimes(1)
  expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
    1,
    '',
    [],
    [],
    'and',
    'p1',
  )
  expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
    2,
    '',
    [],
    [],
    'and',
    'p2',
  )
})

test('loadNext falls back to the network while the prefetch is still in flight', async () => {
  ;(getRandomProblemFiltered as jest.Mock).mockImplementation(
    () => new Promise(() => {}),
  )
  const { result } = await renderHook(() =>
    usePracticeSession({
      ...sessionOpts,
      activeStages: ['pattern'],
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  await act(async () => {
    await result.current.loadNext()
  })
  expect(getRandomProblem).toHaveBeenCalledTimes(2)
})

test('playlist loadNext consumes the prefetched problem with filters intact', async () => {
  const filters = {
    q: 'x',
    difficulties: [],
    tags: [],
    tagMatch: 'and' as const,
  }
  ;(getRandomProblemFiltered as jest.Mock)
    .mockResolvedValueOnce(problem) // startPlaylist load
    .mockResolvedValueOnce(problem2) // prefetch excluding p1
    .mockResolvedValueOnce(problem3) // successor prefetch excluding p2
  const { result } = await renderHook(() =>
    usePracticeSession({
      ...sessionOpts,
      activeStages: ['pattern'],
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(filters)
  })
  await act(async () => {}) // flush prefetch
  await act(async () => {
    await result.current.loadNext()
  })
  expect(result.current.problem?.id).toBe('p2')
  expect(result.current.problemSource).toBe('playlist')
  expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
    2,
    'x',
    [],
    [],
    'and',
    'p1',
  )
  expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
    3,
    'x',
    [],
    [],
    'and',
    'p2',
  )
})

test('playlist loadNext shows end-of-set instantly from a cached 404', async () => {
  const filters = {
    q: 'only-one',
    difficulties: [],
    tags: [],
    tagMatch: 'and' as const,
  }
  ;(getRandomProblemFiltered as jest.Mock)
    .mockResolvedValueOnce(problem) // startPlaylist load
    .mockRejectedValueOnce(new ApiError('not found', 404)) // prefetch 404s
  const { result } = await renderHook(() =>
    usePracticeSession({
      ...sessionOpts,
      activeStages: ['pattern'],
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(filters)
  })
  await act(async () => {}) // flush prefetch rejection
  ;(getRandomProblemFiltered as jest.Mock).mockClear()
  await act(async () => {
    await result.current.loadNext()
  })
  expect(result.current.exhausted).toBe(true)
  expect(getRandomProblemFiltered).not.toHaveBeenCalled()
})
