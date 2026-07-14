import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { TopicProficiency, ProficiencySnapshot } from '../types'

vi.mock('../api', () => ({
  getProficiency: vi.fn(),
  getProficiencyHistory: vi.fn(),
}))

import { getProficiency, getProficiencyHistory } from '../api'
import { useStats, invalidateStatsCache } from './useStats'

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

beforeEach(() => {
  invalidateStatsCache()
  vi.mocked(getProficiency).mockReset().mockResolvedValue(prof)
  vi.mocked(getProficiencyHistory).mockReset().mockResolvedValue(hist)
})

describe('useStats', () => {
  it('fetches both endpoints on first mount', async () => {
    const { result } = renderHook(() => useStats())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.proficiencies).toEqual(prof)
    expect(result.current.history).toEqual(hist)
    expect(result.current.error).toBe(false)
    expect(getProficiency).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(1)
  })

  it('serves cache on remount without refetching', async () => {
    const first = renderHook(() => useStats())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.unmount()

    const second = renderHook(() => useStats())
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.proficiencies).toEqual(prof)
    expect(second.result.current.history).toEqual(hist)
    expect(getProficiency).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(1)
  })

  it('refetches after invalidateStatsCache', async () => {
    const first = renderHook(() => useStats())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.unmount()

    invalidateStatsCache()
    const second = renderHook(() => useStats())
    expect(second.result.current.loading).toBe(true)
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(getProficiency).toHaveBeenCalledTimes(2)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(2)
  })

  it('failed fetch sets error and does not populate cache', async () => {
    vi.mocked(getProficiency).mockRejectedValue(new Error('boom'))
    const first = renderHook(() => useStats())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.error).toBe(true)
    first.unmount()

    vi.mocked(getProficiency).mockResolvedValue(prof)
    const second = renderHook(() => useStats())
    expect(second.result.current.loading).toBe(true)
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.error).toBe(false)
    expect(second.result.current.proficiencies).toEqual(prof)
  })
})
