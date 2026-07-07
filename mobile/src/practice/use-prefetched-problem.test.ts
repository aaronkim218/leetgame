import { renderHook } from '@testing-library/react-native'
import type { Problem } from '../types'
import { ApiError } from '../api/errors'

jest.mock('../api/problems', () => ({
  getRandomProblemFiltered: jest.fn(),
}))

import { getRandomProblemFiltered } from '../api/problems'
import {
  usePrefetchedProblem,
  type PrefetchContext,
} from './use-prefetched-problem'

const makeProblem = (id: string): Problem => ({
  id,
  slug: `slug-${id}`,
  title: `Problem ${id}`,
  description: 'desc',
  difficulty: 'Easy',
  topic_tags: [],
  leetcode_id: null,
})

const ctx = (excludeId?: string): PrefetchContext => ({
  q: '',
  difficulties: [],
  tags: [],
  tagMatch: 'and',
  excludeId,
})

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  ;(getRandomProblemFiltered as jest.Mock).mockReset()
})

test('take on empty slot returns null', async () => {
  const { result } = await renderHook(() => usePrefetchedProblem())
  expect(result.current.take(ctx('a'))).toBeNull()
})

test('prefetch then take with matching context returns the problem and empties the slot', async () => {
  const p = makeProblem('next')
  ;(getRandomProblemFiltered as jest.Mock).mockResolvedValue(p)
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  await tick()

  expect(result.current.take(ctx('current'))).toEqual({ problem: p })
  expect(result.current.take(ctx('current'))).toBeNull()
})

test('passes the context through to getRandomProblemFiltered', async () => {
  ;(getRandomProblemFiltered as jest.Mock).mockResolvedValue(makeProblem('x'))
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch({
    q: 'two',
    difficulties: ['Easy', 'Medium'],
    tags: ['array'],
    tagMatch: 'or',
    excludeId: 'cur',
  })
  await tick()

  expect(getRandomProblemFiltered).toHaveBeenCalledWith(
    'two',
    ['Easy', 'Medium'],
    ['array'],
    'or',
    'cur',
  )
})

test('take with a mismatched context returns null and does not consume the slot', async () => {
  const p = makeProblem('next')
  ;(getRandomProblemFiltered as jest.Mock).mockResolvedValue(p)
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  await tick()

  expect(result.current.take(ctx('other'))).toBeNull()
  expect(result.current.take(ctx('current'))).toEqual({ problem: p })
})

test('take while the fetch is in flight returns null', async () => {
  const d = deferred<Problem>()
  ;(getRandomProblemFiltered as jest.Mock).mockReturnValue(d.promise)
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  expect(result.current.take(ctx('current'))).toBeNull()
})

test('a 404 is stored as exhausted', async () => {
  ;(getRandomProblemFiltered as jest.Mock).mockRejectedValue(
    new ApiError('not found', 404),
  )
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  await tick()

  expect(result.current.take(ctx('current'))).toEqual({ exhausted: true })
})

test('an exhausted result is consumed by take: second take returns null', async () => {
  ;(getRandomProblemFiltered as jest.Mock).mockRejectedValue(
    new ApiError('not found', 404),
  )
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  await tick()

  expect(result.current.take(ctx('current'))).toEqual({ exhausted: true })
  expect(result.current.take(ctx('current'))).toBeNull()
})

test('a non-404 failure clears the slot', async () => {
  ;(getRandomProblemFiltered as jest.Mock).mockRejectedValue(
    new Error('network down'),
  )
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  await tick()

  expect(result.current.take(ctx('current'))).toBeNull()
})

test('a response arriving after invalidate is dropped', async () => {
  const d = deferred<Problem>()
  ;(getRandomProblemFiltered as jest.Mock).mockReturnValue(d.promise)
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  result.current.invalidate()
  d.resolve(makeProblem('late'))
  await tick()

  expect(result.current.take(ctx('current'))).toBeNull()
})

test('a response arriving after a re-targeting prefetch is dropped', async () => {
  const first = deferred<Problem>()
  const second = deferred<Problem>()
  ;(getRandomProblemFiltered as jest.Mock)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('a'))
  result.current.prefetch(ctx('b'))
  first.resolve(makeProblem('stale'))
  const fresh = makeProblem('fresh')
  second.resolve(fresh)
  await tick()

  expect(result.current.take(ctx('a'))).toBeNull()
  expect(result.current.take(ctx('b'))).toEqual({ problem: fresh })
})
