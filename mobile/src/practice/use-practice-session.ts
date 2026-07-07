import { useCallback, useRef, useState } from 'react'
import type {
  Problem,
  ChatMessage,
  Stage,
  ActiveStage,
  PlaylistFilters,
} from '../types'
import {
  getRandomProblem,
  getSmartPracticeProblem,
  getRandomProblemFiltered,
} from '../api/problems'
import { ApiError } from '../api/errors'
import { streamChat } from '../api/chat'
import { usePrefetchedProblem } from './use-prefetched-problem'
import type { PrefetchContext } from './use-prefetched-problem'

function randomCtx(excludeId?: string): PrefetchContext {
  return { q: '', difficulties: [], tags: [], tagMatch: 'and', excludeId }
}

function playlistCtx(
  filters: PlaylistFilters,
  excludeId?: string,
): PrefetchContext {
  return { ...filters, excludeId }
}

interface Opts {
  activeStages: ActiveStage[]
  activeTopics: string[]
  conciseMode: boolean
  onComplete: () => void
}

export function usePracticeSession({
  activeStages,
  activeTopics,
  conciseMode,
  onComplete,
}: Opts) {
  const [problem, setProblem] = useState<Problem | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [stage, setStage] = useState<Stage>(activeStages[0] ?? 'pattern')
  const [streamingMessage, setStreamingMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [problemSource, setProblemSource] = useState<
    'random' | 'smart' | 'playlist'
  >('random')
  const [exhausted, setExhausted] = useState(false)
  const sessionStagesRef = useRef<ActiveStage[]>(activeStages)
  const abortRef = useRef<AbortController | null>(null)
  const loadSeqRef = useRef(0)
  const playlistFiltersRef = useRef<PlaylistFilters | null>(null)
  const { prefetch, take, invalidate } = usePrefetchedProblem()

  const startSession = useCallback(
    (p: Problem) => {
      abortRef.current?.abort()
      sessionStagesRef.current = activeStages
      setProblem(p)
      setHistory([])
      setStage(activeStages[0] ?? 'pattern')
      setStreamingMessage('')
      setError(null)
    },
    [activeStages],
  )

  const loadRandom = useCallback(async () => {
    const seq = ++loadSeqRef.current
    setError(null)
    try {
      const p = await getRandomProblem()
      if (seq !== loadSeqRef.current) return
      startSession(p)
      setProblemSource('random')
      playlistFiltersRef.current = null
      setExhausted(false)
      prefetch(randomCtx(p.id))
    } catch {
      if (seq !== loadSeqRef.current) return
      setError('Failed to load a problem. Is the backend running?')
    }
  }, [startSession, prefetch])

  const loadSmart = useCallback(async () => {
    invalidate()
    const seq = ++loadSeqRef.current
    setError(null)
    try {
      const p = await getSmartPracticeProblem(activeStages, activeTopics)
      if (seq !== loadSeqRef.current) return
      startSession(p)
      setProblemSource('smart')
      playlistFiltersRef.current = null
      setExhausted(false)
    } catch {
      if (seq !== loadSeqRef.current) return
      setError('Failed to load a problem. Is the backend running?')
    }
  }, [startSession, activeStages, activeTopics, invalidate])

  const loadPlaylistProblem = useCallback(
    async (excludeId?: string) => {
      const filters = playlistFiltersRef.current
      if (!filters) return
      const seq = ++loadSeqRef.current
      setError(null)
      try {
        const p = await getRandomProblemFiltered(
          filters.q,
          filters.difficulties,
          filters.tags,
          filters.tagMatch,
          excludeId,
        )
        if (seq !== loadSeqRef.current) return
        startSession(p)
        setProblemSource('playlist')
        setExhausted(false)
        prefetch(playlistCtx(filters, p.id))
      } catch (e) {
        if (seq !== loadSeqRef.current) return
        if (e instanceof ApiError && e.status === 404) {
          setExhausted(true)
        } else {
          setError('Failed to load a problem. Is the backend running?')
        }
      }
    },
    [startSession, prefetch],
  )

  const startPlaylist = useCallback(
    (filters: PlaylistFilters, initialProblem?: Problem) => {
      playlistFiltersRef.current = filters
      setExhausted(false)
      if (initialProblem) {
        ++loadSeqRef.current
        startSession(initialProblem)
        setProblemSource('playlist')
        prefetch(playlistCtx(filters, initialProblem.id))
        return Promise.resolve()
      }
      return loadPlaylistProblem()
    },
    [startSession, loadPlaylistProblem, prefetch],
  )

  const restartPlaylist = useCallback(
    () => loadPlaylistProblem(),
    [loadPlaylistProblem],
  )

  const loadNext = useCallback(() => {
    if (problemSource === 'smart') return loadSmart()
    if (problemSource === 'playlist') {
      const filters = playlistFiltersRef.current
      if (filters) {
        const cached = take(playlistCtx(filters, problem?.id))
        if (cached) {
          if ('exhausted' in cached) {
            setExhausted(true)
            return Promise.resolve()
          }
          ++loadSeqRef.current
          startSession(cached.problem)
          setProblemSource('playlist')
          setExhausted(false)
          prefetch(playlistCtx(filters, cached.problem.id))
          return Promise.resolve()
        }
      }
      return loadPlaylistProblem(problem?.id)
    }
    const cached = take(randomCtx(problem?.id))
    if (cached && 'problem' in cached) {
      ++loadSeqRef.current
      startSession(cached.problem)
      setProblemSource('random')
      playlistFiltersRef.current = null
      setExhausted(false)
      prefetch(randomCtx(cached.problem.id))
      return Promise.resolve()
    }
    return loadRandom()
  }, [
    problemSource,
    loadSmart,
    loadRandom,
    loadPlaylistProblem,
    problem,
    take,
    prefetch,
    startSession,
  ])

  const submit = useCallback(
    async (message: string, opts?: { hint?: boolean; answer?: boolean }) => {
      if (!problem) return
      const hint = opts?.hint ?? false
      const answer = opts?.answer ?? false

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError(null)
      setStreamingMessage('')

      const userMsg: ChatMessage = {
        role: 'user',
        content: message,
        marker: hint ? 'hint' : answer ? 'answer' : undefined,
      }
      const priorHistory = history
      setHistory([...priorHistory, userMsg])

      try {
        let accumulated = ''
        for await (const event of streamChat(
          problem.id,
          stage,
          sessionStagesRef.current,
          priorHistory,
          message,
          hint,
          answer,
          conciseMode,
          controller.signal,
        )) {
          if (event.type === 'token') {
            accumulated += event.content
            setStreamingMessage(accumulated)
          } else if (event.type === 'done') {
            setHistory([
              ...priorHistory,
              userMsg,
              { role: 'assistant', content: event.message },
            ])
            setStage(event.stage)
            setStreamingMessage('')
            if (event.stage === 'complete') onComplete()
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setError('Something went wrong. Please try again.')
      } finally {
        setLoading(false)
        setStreamingMessage('')
      }
    },
    [problem, history, stage, conciseMode, onComplete],
  )

  return {
    problem,
    history,
    stage,
    streamingMessage,
    loading,
    error,
    sessionActiveStages: sessionStagesRef.current,
    problemSource,
    exhausted,
    playlistFilters: playlistFiltersRef.current,
    loadRandom,
    loadSmart,
    loadNext,
    startPlaylist,
    restartPlaylist,
    submit,
  }
}
