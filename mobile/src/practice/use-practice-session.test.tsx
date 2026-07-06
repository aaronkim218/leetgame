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
}))

import { getRandomProblem, getSmartPracticeProblem } from '../api/problems'

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
  expect(getRandomProblem).toHaveBeenCalledTimes(2)
})
