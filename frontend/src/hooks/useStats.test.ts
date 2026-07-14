import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { TopicProficiency, ProficiencySnapshot } from '../types'

vi.mock('../api', () => ({
  getProficiency: vi.fn(),
  getProficiencyHistory: vi.fn(),
}))

import { getProficiency, getProficiencyHistory } from '../api'
import { useStats, invalidateStatsCache } from './useStats'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const prof: TopicProficiency[] = [
  {
    user_id: 'u1',
    topic: 'Arrays & Hashing',
    stage: 'pattern',
    score: 0.5,
    updated_at: '2026-07-14T00:00:00Z',
  },
]
const hist: ProficiencySnapshot[] = [
  {
    topic: 'Arrays & Hashing',
    stage: 'pattern',
    score: 0.5,
    snapshot_date: '2026-07-14',
  },
]
const hist3m: ProficiencySnapshot[] = [
  {
    topic: 'Arrays & Hashing',
    stage: 'pattern',
    score: 0.4,
    snapshot_date: '2026-05-01',
  },
  ...hist,
]

beforeEach(() => {
  invalidateStatsCache()
  vi.mocked(getProficiency).mockReset().mockResolvedValue(prof)
  vi.mocked(getProficiencyHistory)
    .mockReset()
    .mockImplementation((w) => Promise.resolve(w === '3m' ? hist3m : hist))
})

describe('useStats', () => {
  it('fetches proficiency and windowed history on first mount', async () => {
    const { result } = renderHook(() => useStats('1m'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.proficiencies).toEqual(prof)
    expect(result.current.history).toEqual(hist)
    expect(result.current.error).toBe(false)
    expect(getProficiency).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledWith('1m', expect.anything())
  })

  it('serves cache on remount without refetching', async () => {
    const first = renderHook(() => useStats('1m'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.unmount()

    const second = renderHook(() => useStats('1m'))
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.historyLoading).toBe(false)
    expect(second.result.current.history).toEqual(hist)
    expect(getProficiency).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(1)
  })

  it('window switch fetches history only, not proficiency', async () => {
    const { result, rerender } = renderHook(
      ({ w }: { w: '1m' | '3m' }) => useStats(w),
      { initialProps: { w: '1m' as '1m' | '3m' } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    rerender({ w: '3m' })
    expect(result.current.historyLoading).toBe(true)
    expect(result.current.loading).toBe(false)
    await waitFor(() => expect(result.current.historyLoading).toBe(false))
    expect(result.current.history).toEqual(hist3m)
    expect(getProficiency).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(2)
    expect(getProficiencyHistory).toHaveBeenLastCalledWith(
      '3m',
      expect.anything(),
    )
  })

  it('switching back to a cached window issues no request', async () => {
    const { result, rerender } = renderHook(
      ({ w }: { w: '1m' | '3m' }) => useStats(w),
      { initialProps: { w: '1m' as '1m' | '3m' } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ w: '3m' })
    await waitFor(() => expect(result.current.historyLoading).toBe(false))

    rerender({ w: '1m' })
    expect(result.current.historyLoading).toBe(false)
    expect(result.current.history).toEqual(hist)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(2)
  })

  it('invalidateStatsCache clears every window', async () => {
    const first = renderHook(({ w }: { w: '1m' | '3m' }) => useStats(w), {
      initialProps: { w: '1m' as '1m' | '3m' },
    })
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.rerender({ w: '3m' })
    await waitFor(() => expect(first.result.current.historyLoading).toBe(false))
    first.unmount()

    invalidateStatsCache()
    const second = renderHook(() => useStats('3m'))
    expect(second.result.current.loading).toBe(true)
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(getProficiency).toHaveBeenCalledTimes(2)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(3)
  })

  it('failed fetch sets error and does not populate cache', async () => {
    vi.mocked(getProficiency).mockRejectedValue(new Error('boom'))
    const first = renderHook(() => useStats('1m'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.error).toBe(true)
    first.unmount()

    vi.mocked(getProficiency).mockResolvedValue(prof)
    const second = renderHook(() => useStats('1m'))
    expect(second.result.current.loading).toBe(true)
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.error).toBe(false)
    expect(second.result.current.proficiencies).toEqual(prof)
  })

  it('fetch resolving after invalidation does not repopulate the cache', async () => {
    const d = deferred<TopicProficiency[]>()
    vi.mocked(getProficiency).mockReturnValue(d.promise)
    const first = renderHook(() => useStats('1m'))
    invalidateStatsCache()
    d.resolve(prof)
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.unmount()

    vi.mocked(getProficiency).mockResolvedValue(prof)
    const second = renderHook(() => useStats('1m'))
    expect(second.result.current.loading).toBe(true)
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(getProficiency).toHaveBeenCalledTimes(2)
  })
})
