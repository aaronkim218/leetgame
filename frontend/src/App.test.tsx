import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Problem } from './types'

vi.mock('./api', () => {
  class ApiError extends Error {
    readonly status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  }
  return {
    ApiError,
    getRandomProblem: vi.fn(),
    getRandomProblemFiltered: vi.fn(),
    searchProblems: vi.fn(async () => ({
      problems: [],
      page: 1,
      page_size: 20,
      total: 0,
    })),
    streamChat: vi.fn(),
    getSmartPracticeProblem: vi.fn(),
  }
})

vi.mock('./hooks/useAuth', () => {
  // stable reference: the real hook returns a useState-backed array that
  // doesn't change identity across renders, so the mock must match that or
  // App's `activeStages`-dependent effect re-fires every render
  const activeStages = ['pattern']
  return {
    useAuth: () => ({
      session: null,
      authLoading: false,
      streak: 0,
      streakStatus: null,
      activeStages,
      hideTitle: false,
      hideDifficulty: false,
      conciseMode: false,
      activeTopics: [],
      tourDone: true,
      settingsReady: true,
      persistStages: vi.fn(),
      persistHideTitle: vi.fn(),
      persistHideDifficulty: vi.fn(),
      persistConciseMode: vi.fn(),
      persistTopics: vi.fn(),
      persistTourDone: vi.fn(),
      recordAndUpdateStreak: vi.fn(),
    }),
  }
})

vi.mock('./hooks/useTags', () => ({
  useTags: () => ({ availableTags: [], tagsLoading: false, tagsError: null }),
}))

vi.mock('./hooks/useSaved', () => ({
  useSaved: () => ({
    savedProblems: [],
    savedIds: new Set(),
    save: vi.fn(),
    unsave: vi.fn(),
    isSaved: () => false,
  }),
}))

vi.mock('./hooks/useTour', () => ({
  useTour: () => ({ showBanner: false, dismiss: vi.fn(), markDone: vi.fn() }),
}))

vi.mock('./components/NavBar', () => ({ NavBar: () => <nav /> }))

vi.mock('./components/ProblemView', () => ({
  ProblemView: ({
    problem,
    onSkip,
  }: {
    problem: Problem
    onSkip: () => void
  }) => (
    <div>
      <h1>{problem.title}</h1>
      <button onClick={onSkip}>Skip</button>
    </div>
  ),
}))

vi.mock('./components/ChatView', () => ({ ChatView: () => <div /> }))

import App from './App'
import { getRandomProblem, getRandomProblemFiltered } from './api'

const makeProblem = (id: string, title: string): Problem => ({
  id,
  slug: id,
  title,
  description: 'desc',
  difficulty: 'Easy',
  topic_tags: [],
  leetcode_id: null,
})

beforeEach(() => {
  vi.mocked(getRandomProblem).mockReset()
  vi.mocked(getRandomProblemFiltered).mockReset()
})

describe('next-problem prefetching (random mode)', () => {
  it('Next consumes the prefetched problem without another fetch, then prefetches the successor', async () => {
    const p1 = makeProblem('p1', 'Two Sum')
    const p2 = makeProblem('p2', 'Prefetched Problem')
    const p3 = makeProblem('p3', 'Second Prefetch')
    vi.mocked(getRandomProblem).mockResolvedValue(p1)
    vi.mocked(getRandomProblemFiltered)
      .mockResolvedValueOnce(p2)
      .mockResolvedValueOnce(p3)

    render(<App />)

    await screen.findByText('Two Sum')
    // initial load fired a background prefetch excluding the current problem
    await waitFor(() =>
      expect(getRandomProblemFiltered).toHaveBeenCalledTimes(1),
    )
    expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
      1,
      '',
      [],
      [],
      'and',
      'p1',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))

    // the prefetched problem rendered without a second getRandomProblem call
    await screen.findByText('Prefetched Problem')
    expect(getRandomProblem).toHaveBeenCalledTimes(1)
    // and the successor prefetch fired, excluding the new current problem
    await waitFor(() =>
      expect(getRandomProblemFiltered).toHaveBeenCalledTimes(2),
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

  it('falls back to the network when the slot is empty', async () => {
    const p1 = makeProblem('p1', 'Two Sum')
    const p2 = makeProblem('p2', 'Fallback Problem')
    vi.mocked(getRandomProblem)
      .mockResolvedValueOnce(p1)
      .mockResolvedValueOnce(p2)
    // prefetches never resolve — slot stays in flight
    vi.mocked(getRandomProblemFiltered).mockReturnValue(
      new Promise<Problem>(() => {}),
    )

    render(<App />)
    await screen.findByText('Two Sum')

    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))

    await screen.findByText('Fallback Problem')
    expect(getRandomProblem).toHaveBeenCalledTimes(2)
  })
})
