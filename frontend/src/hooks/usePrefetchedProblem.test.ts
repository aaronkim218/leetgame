import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Problem } from '../types'

vi.mock('../api', () => {
  class ApiError extends Error {
    readonly status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  }
  return { ApiError, getRandomProblemFiltered: vi.fn() }
})

import { ApiError, getRandomProblemFiltered } from '../api'
import {
  usePrefetchedProblem,
  type PrefetchContext,
} from './usePrefetchedProblem'

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
  vi.mocked(getRandomProblemFiltered).mockReset()
})

describe('usePrefetchedProblem', () => {
  it('take on empty slot returns null', () => {
    const { result } = renderHook(() => usePrefetchedProblem())
    expect(result.current.take(ctx('a'))).toBeNull()
  })

  it('prefetch then take with matching context returns the problem and empties the slot', async () => {
    const p = makeProblem('next')
    vi.mocked(getRandomProblemFiltered).mockResolvedValue(p)
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    await tick()

    expect(result.current.take(ctx('current'))).toEqual({ problem: p })
    expect(result.current.take(ctx('current'))).toBeNull()
  })

  it('passes the context through to getRandomProblemFiltered', async () => {
    vi.mocked(getRandomProblemFiltered).mockResolvedValue(makeProblem('x'))
    const { result } = renderHook(() => usePrefetchedProblem())

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

  it('take with a mismatched context returns null and does not consume the slot', async () => {
    const p = makeProblem('next')
    vi.mocked(getRandomProblemFiltered).mockResolvedValue(p)
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    await tick()

    expect(result.current.take(ctx('other'))).toBeNull()
    expect(result.current.take(ctx('current'))).toEqual({ problem: p })
  })

  it('take while the fetch is in flight returns null', () => {
    const d = deferred<Problem>()
    vi.mocked(getRandomProblemFiltered).mockReturnValue(d.promise)
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    expect(result.current.take(ctx('current'))).toBeNull()
  })

  it('a 404 is stored as exhausted', async () => {
    vi.mocked(getRandomProblemFiltered).mockRejectedValue(
      new ApiError('not found', 404),
    )
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    await tick()

    expect(result.current.take(ctx('current'))).toEqual({ exhausted: true })
  })

  it('a non-404 failure clears the slot', async () => {
    vi.mocked(getRandomProblemFiltered).mockRejectedValue(
      new Error('network down'),
    )
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    await tick()

    expect(result.current.take(ctx('current'))).toBeNull()
  })

  it('a response arriving after invalidate is dropped', async () => {
    const d = deferred<Problem>()
    vi.mocked(getRandomProblemFiltered).mockReturnValue(d.promise)
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    result.current.invalidate()
    d.resolve(makeProblem('late'))
    await tick()

    expect(result.current.take(ctx('current'))).toBeNull()
  })

  it('a response arriving after a re-targeting prefetch is dropped', async () => {
    const first = deferred<Problem>()
    const second = deferred<Problem>()
    vi.mocked(getRandomProblemFiltered)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('a'))
    result.current.prefetch(ctx('b'))
    first.resolve(makeProblem('stale'))
    const fresh = makeProblem('fresh')
    second.resolve(fresh)
    await tick()

    expect(result.current.take(ctx('a'))).toBeNull()
    expect(result.current.take(ctx('b'))).toEqual({ problem: fresh })
  })
})
