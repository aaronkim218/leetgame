import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { Session } from '@supabase/supabase-js'
import { useSaved } from './use-saved'

const problem = {
  id: 'p1',
  slug: 's',
  title: 'T',
  description: 'D',
  difficulty: 'Easy' as const,
  topic_tags: [],
  leetcode_id: 1,
}

jest.mock('../api/saved', () => ({
  getSavedProblems: jest.fn(),
  saveProblem: jest.fn(async () => {}),
  unsaveProblem: jest.fn(async () => {}),
}))

import { getSavedProblems, saveProblem, unsaveProblem } from '../api/saved'

const session = { user: { id: 'u1' } } as unknown as Session

beforeEach(() => {
  ;(getSavedProblems as jest.Mock).mockReset().mockResolvedValue([problem])
  ;(saveProblem as jest.Mock).mockClear().mockResolvedValue(undefined)
  ;(unsaveProblem as jest.Mock).mockClear().mockResolvedValue(undefined)
})

test('anonymous: no fetch, empty saved list', async () => {
  const { result } = await renderHook(() => useSaved(null))
  expect(result.current.savedProblems).toEqual([])
  expect(getSavedProblems).not.toHaveBeenCalled()
})

test('signed in: fetches saved problems and exposes ids', async () => {
  const { result } = await renderHook(() => useSaved(session))
  await waitFor(() => expect(result.current.savedProblems).toEqual([problem]))
  expect(result.current.savedIds.has('p1')).toBe(true)
  expect(result.current.isSaved('p1')).toBe(true)
})

test('save is optimistic and calls the API', async () => {
  ;(getSavedProblems as jest.Mock).mockResolvedValue([])
  const { result } = await renderHook(() => useSaved(session))
  const p2 = { ...problem, id: 'p2' }
  await act(async () => {
    await result.current.save(p2)
  })
  expect(result.current.isSaved('p2')).toBe(true)
  expect(saveProblem).toHaveBeenCalledWith('p2')
})

test('unsave removes optimistically and calls the API', async () => {
  const { result } = await renderHook(() => useSaved(session))
  await waitFor(() => expect(result.current.isSaved('p1')).toBe(true))
  await act(async () => {
    await result.current.unsave('p1')
  })
  expect(result.current.isSaved('p1')).toBe(false)
  expect(unsaveProblem).toHaveBeenCalledWith('p1')
})

test('failed save refetches the authoritative list', async () => {
  ;(getSavedProblems as jest.Mock).mockResolvedValue([])
  ;(saveProblem as jest.Mock).mockRejectedValue(new Error('boom'))
  const { result } = await renderHook(() => useSaved(session))
  await act(async () => {
    await result.current.save(problem)
  })
  // initial fetch + recovery refetch
  await waitFor(() => expect(getSavedProblems).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(result.current.savedProblems).toEqual([]))
})
