import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ProblemTag } from '../types'

vi.mock('../api', () => ({
  getProblemTags: vi.fn(),
}))

const tags: ProblemTag[] = [{ name: 'Arrays & Hashing', count: 10 }]

async function setup() {
  const api = await import('../api')
  vi.mocked(api.getProblemTags).mockResolvedValue(tags)
  const { useTags } = await import('./useTags')
  return { api, useTags }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('useTags', () => {
  it('fetches tags on first mount', async () => {
    const { api, useTags } = await setup()
    const { result } = renderHook(() => useTags())
    expect(result.current.tagsLoading).toBe(true)
    await waitFor(() => expect(result.current.tagsLoading).toBe(false))
    expect(result.current.availableTags).toEqual(tags)
    expect(api.getProblemTags).toHaveBeenCalledTimes(1)
  })

  it('serves cache on remount without refetching', async () => {
    const { api, useTags } = await setup()
    const first = renderHook(() => useTags())
    await waitFor(() => expect(first.result.current.tagsLoading).toBe(false))
    first.unmount()

    const second = renderHook(() => useTags())
    expect(second.result.current.tagsLoading).toBe(false)
    expect(second.result.current.availableTags).toEqual(tags)
    expect(api.getProblemTags).toHaveBeenCalledTimes(1)
  })

  it('failed fetch sets error and does not populate cache', async () => {
    const { api, useTags } = await setup()
    vi.mocked(api.getProblemTags).mockRejectedValue(new Error('boom'))
    const first = renderHook(() => useTags())
    await waitFor(() => expect(first.result.current.tagsLoading).toBe(false))
    expect(first.result.current.tagsError).toBe('Failed to load tags.')
    first.unmount()

    vi.mocked(api.getProblemTags).mockResolvedValue(tags)
    const second = renderHook(() => useTags())
    expect(second.result.current.tagsLoading).toBe(true)
    await waitFor(() => expect(second.result.current.tagsLoading).toBe(false))
    expect(second.result.current.availableTags).toEqual(tags)
  })
})
