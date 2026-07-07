import { useEffect, useState, useRef } from 'react'
import type {
  Problem,
  ChatMessage,
  Stage,
  ActiveStage,
  SearchState,
  View,
} from './types'
import { defaultSearchState } from './types'
import {
  ApiError,
  getRandomProblem,
  getRandomProblemFiltered,
  searchProblems,
  streamChat,
  getSmartPracticeProblem,
} from './api'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import { useSearch, SEARCH_PAGE_SIZE } from './hooks/useSearch'
import { useTags } from './hooks/useTags'
import { useSaved } from './hooks/useSaved'
import { useSessionStack } from './hooks/useSessionStack'
import {
  usePrefetchedProblem,
  type PrefetchContext,
} from './hooks/usePrefetchedProblem'
import { NavBar } from './components/NavBar'
import { ProblemView } from './components/ProblemView'
import { ChatView } from './components/ChatView'
import { EndOfSetView } from './components/EndOfSetView'
import {
  SearchPage,
  type SearchSelectionContext,
} from './components/SearchPage'
import { StatsPage } from './components/StatsPage'
import { MissionPage } from './components/MissionPage'
import { TourBanner } from './components/TourBanner'
import { useTour } from './hooks/useTour'
import { startTour } from './tour'

type ProblemSource = 'random' | 'search' | 'smart'

interface PracticeSnapshot {
  problem: Problem
  stage: Stage
  history: ChatMessage[]
  searchPlaylist: SearchPlaylist | null
  problemSource: ProblemSource
  shuffle: boolean
  stageBannerDismissed: boolean
}

interface SearchPlaylist {
  q: string
  difficulties: string[]
  tags: string[]
  tagMatch: 'and' | 'or'
  page: number
  pageSize: number
  results: Problem[]
  selectedIndex: number
}

function getPlaylistSummary(searchPlaylist: SearchPlaylist | null) {
  if (!searchPlaylist) return null

  if (
    !searchPlaylist.q &&
    searchPlaylist.difficulties.length === 0 &&
    searchPlaylist.tags.length === 0
  ) {
    return null
  }

  return {
    q: searchPlaylist.q,
    difficulties: searchPlaylist.difficulties,
    tags: searchPlaylist.tags,
    tagMatch: searchPlaylist.tagMatch,
  }
}

export default function App() {
  const {
    session,
    authLoading,
    streak,
    streakStatus,
    activeStages,
    hideTitle,
    hideDifficulty,
    conciseMode,
    activeTopics,
    tourDone,
    settingsReady,
    persistStages,
    persistHideTitle,
    persistHideDifficulty,
    persistConciseMode,
    persistTopics,
    persistTourDone,
    recordAndUpdateStreak,
  } = useAuth()
  const {
    showBanner,
    dismiss: dismissTour,
    markDone: markTourDone,
  } = useTour(!!session, settingsReady, tourDone, persistTourDone)

  const handleStartTour = () => {
    if (view !== 'practice') setView('practice')
    setTimeout(
      () => {
        startTour(markTourDone, !!session)
      },
      view !== 'practice' ? 100 : 0,
    )
  }

  const [view, setView] = useState<View>('practice')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [problemSource, setProblemSource] = useState<ProblemSource>('random')
  const [searchPlaylist, setSearchPlaylist] = useState<SearchPlaylist | null>(
    null,
  )
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [stage, setStage] = useState<Stage>('pattern')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playlistExhausted, setPlaylistExhausted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [sessionActiveStages, setSessionActiveStages] =
    useState<ActiveStage[]>(activeStages)
  const [stageBannerDismissed, setStageBannerDismissed] = useState(false)
  const {
    canGoBack,
    push: pushToStack,
    pop: popFromStack,
    clear: clearStack,
  } = useSessionStack<PracticeSnapshot>()
  const { prefetch, take, invalidate } = usePrefetchedProblem()

  const randomCtx = (excludeId?: string): PrefetchContext => ({
    q: '',
    difficulties: [],
    tags: [],
    tagMatch: 'and',
    excludeId,
  })

  const playlistCtx = (
    pl: SearchPlaylist,
    excludeId?: string,
  ): PrefetchContext => ({
    q: pl.q,
    difficulties: pl.difficulties,
    tags: pl.tags,
    tagMatch: pl.tagMatch,
    excludeId,
  })
  const [searchState, setSearchState] =
    useState<SearchState>(defaultSearchState)
  const { loading: searchLoading, error: searchError } = useSearch(
    searchState,
    setSearchState,
  )
  const { availableTags, tagsLoading, tagsError } = useTags()
  const { savedProblems, savedIds, save, unsave, isSaved } = useSaved(session)
  const { theme, setTheme } = useTheme()
  const streamAbortRef = useRef<AbortController | null>(null)

  const resetPracticeState = () => {
    setHistory([])
    setStage(activeStages[0])
    setStreamingMessage('')
    setSessionActiveStages(activeStages)
    setStageBannerDismissed(false)
  }

  const captureSnapshot = (): PracticeSnapshot | null => {
    if (!problem) return null
    return {
      problem,
      stage,
      history,
      searchPlaylist,
      problemSource,
      shuffle,
      stageBannerDismissed,
    }
  }

  const goBack = () => {
    const snap = popFromStack()
    if (!snap) return
    invalidate()
    setProblem(snap.problem)
    setStage(snap.stage)
    setHistory(snap.history)
    setSearchPlaylist(snap.searchPlaylist)
    setProblemSource(snap.problemSource)
    setShuffle(snap.shuffle)
    setStageBannerDismissed(snap.stageBannerDismissed)
    setPlaylistExhausted(false)
    setError(null)
    setStreamingMessage('')
  }

  const handleStagesChange = (stages: ActiveStage[]) => {
    persistStages(stages)
    setStageBannerDismissed(false)
  }

  const handleHideTitleChange = (value: boolean) => {
    persistHideTitle(value)
  }

  const handleHideDifficultyChange = (value: boolean) => {
    persistHideDifficulty(value)
  }

  const handleConciseModeChange = (value: boolean) => {
    persistConciseMode(value)
  }

  const loadRandomProblem = async () => {
    try {
      setError(null)
      setPlaylistExhausted(false)
      const p = await getRandomProblem()
      clearStack()
      setProblem(p)
      setProblemSource('random')
      setSearchPlaylist(null)
      resetPracticeState()
      prefetch(randomCtx(p.id))
    } catch {
      setError('Failed to load problem. Is the backend running?')
    }
  }

  const loadNextSearchProblem = async () => {
    invalidate()
    if (!searchPlaylist) {
      await loadRandomProblem()
      return
    }

    const nextIndex = searchPlaylist.selectedIndex + 1
    if (nextIndex < searchPlaylist.results.length) {
      const snap = captureSnapshot()
      if (snap) pushToStack(snap)
      setProblem(searchPlaylist.results[nextIndex])
      setSearchPlaylist({ ...searchPlaylist, selectedIndex: nextIndex })
      resetPracticeState()
      setPlaylistExhausted(false)
      setError(null)
      return
    }

    const nextPage = searchPlaylist.page + 1
    const snap = captureSnapshot()
    try {
      setError(null)
      const res = await searchProblems(
        searchPlaylist.q,
        searchPlaylist.difficulties,
        searchPlaylist.tags,
        searchPlaylist.tagMatch,
        nextPage,
        searchPlaylist.pageSize,
      )

      // skip past the current problem if the fetched page contains it —
      // e.g. a playlist entered via "Enter Playlist" starts with an empty
      // results cache, so page 1 would otherwise re-serve the same problem
      const currentIdx = problem
        ? res.problems.findIndex((p) => p.id === problem.id)
        : -1
      const startIdx = currentIdx + 1
      if (startIdx >= res.problems.length) {
        setPlaylistExhausted(true)
        setError(null)
        return
      }

      if (snap) pushToStack(snap)
      setProblem(res.problems[startIdx])
      setSearchPlaylist({
        ...searchPlaylist,
        page: res.page,
        pageSize: res.page_size,
        results: res.problems,
        selectedIndex: startIdx,
      })
      resetPracticeState()
      setPlaylistExhausted(false)
    } catch {
      setError(
        'Failed to load the next filtered problem. Is the backend running?',
      )
    }
  }

  const loadNextProblem = async () => {
    if (problemSource === 'search') {
      if (shuffle) {
        await loadRandomNextProblem()
      } else {
        await loadNextSearchProblem()
      }
      return
    }
    if (problemSource === 'smart') {
      await loadSmartPracticeProblem()
      return
    }
    // random mode: push current state, then load next
    const snap = captureSnapshot()
    const cached = take(randomCtx(problem?.id))
    if (cached && 'problem' in cached) {
      setError(null)
      setPlaylistExhausted(false)
      if (snap) pushToStack(snap)
      setProblem(cached.problem)
      setProblemSource('random')
      setSearchPlaylist(null)
      resetPracticeState()
      prefetch(randomCtx(cached.problem.id))
      return
    }
    try {
      setError(null)
      setPlaylistExhausted(false)
      const p = await getRandomProblem()
      if (snap) pushToStack(snap)
      setProblem(p)
      setProblemSource('random')
      setSearchPlaylist(null)
      resetPracticeState()
      prefetch(randomCtx(p.id))
    } catch {
      setError('Failed to load problem. Is the backend running?')
    }
  }

  const loadRandomNextProblem = async () => {
    if (!searchPlaylist) return
    const snap = captureSnapshot()
    const cached = take(playlistCtx(searchPlaylist, problem?.id))
    if (cached) {
      if ('exhausted' in cached) {
        setPlaylistExhausted(true)
        setError(null)
        return
      }
      setError(null)
      setPlaylistExhausted(false)
      if (snap) pushToStack(snap)
      setProblem(cached.problem)
      resetPracticeState()
      prefetch(playlistCtx(searchPlaylist, cached.problem.id))
      return
    }
    try {
      setError(null)
      const p = await getRandomProblemFiltered(
        searchPlaylist.q,
        searchPlaylist.difficulties,
        searchPlaylist.tags,
        searchPlaylist.tagMatch,
        problem?.id,
      )
      if (snap) pushToStack(snap)
      setProblem(p)
      resetPracticeState()
      setPlaylistExhausted(false)
      prefetch(playlistCtx(searchPlaylist, p.id))
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // no other problem matches the filters — the set is done
        setPlaylistExhausted(true)
        setError(null)
        return
      }
      setError(
        'Failed to load a random filtered problem. Is the backend running?',
      )
    }
  }

  const loadSmartPracticeProblem = async () => {
    invalidate()
    const isNextInSmartMode = problemSource === 'smart'
    const snap = captureSnapshot()
    try {
      setError(null)
      setPlaylistExhausted(false)
      const p = await getSmartPracticeProblem(activeStages, activeTopics)
      if (isNextInSmartMode && snap) {
        pushToStack(snap)
      } else {
        clearStack()
      }
      setProblem(p)
      setProblemSource('smart')
      setSearchPlaylist(null)
      resetPracticeState()
    } catch {
      setError('Failed to load smart practice problem. Is the backend running?')
    }
  }

  const enterPlaylistFromSearch = async () => {
    const { q, difficulties, tags, tagMatch } = searchState
    try {
      setError(null)
      setPlaylistExhausted(false)
      setShuffle(true)
      const p = await getRandomProblemFiltered(q, difficulties, tags, tagMatch)
      clearStack()
      setProblem(p)
      setProblemSource('search')
      setSearchPlaylist({
        q,
        difficulties,
        tags,
        tagMatch,
        page: 0,
        pageSize: SEARCH_PAGE_SIZE,
        results: [],
        selectedIndex: -1,
      })
      resetPracticeState()
      prefetch({ q, difficulties, tags, tagMatch, excludeId: p.id })
      setView('practice')
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError('No problems match those filters.')
        setView('practice')
        return
      }
      setError(
        'Failed to load a problem with those filters. Is the backend running?',
      )
    }
  }

  const selectProblem = (p: Problem, context: SearchSelectionContext) => {
    invalidate()
    clearStack()
    setShuffle(false)
    setProblem(p)
    setProblemSource('search')
    setPlaylistExhausted(false)
    setSearchPlaylist({
      q: context.q,
      difficulties: context.difficulties,
      tags: context.tags,
      tagMatch: context.tagMatch,
      page: context.page,
      pageSize: context.pageSize,
      results: context.results,
      selectedIndex: context.selectedIndex,
    })
    resetPracticeState()
    setError(null)
    setView('practice')
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (settingsReady && !problem) void loadRandomProblem()
  }, [settingsReady])

  useEffect(() => {
    if (history.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSessionActiveStages(activeStages)
      setStage(activeStages[0])
      setStageBannerDismissed(false)
    }
  }, [activeStages])

  useEffect(() => {
    if (!session && view === 'stats') setView('practice')
  }, [session, view])

  useEffect(
    () => () => {
      streamAbortRef.current?.abort()
    },
    [problem],
  )

  const restartSearchSet = async () => {
    if (!searchPlaylist) return
    invalidate()

    try {
      setError(null)
      const res = await searchProblems(
        searchPlaylist.q,
        searchPlaylist.difficulties,
        searchPlaylist.tags,
        searchPlaylist.tagMatch,
        1,
        searchPlaylist.pageSize,
      )

      if (res.problems.length === 0) {
        setError('No problems match the current practice set.')
        return
      }

      clearStack()
      setProblem(res.problems[0])
      setSearchPlaylist({
        ...searchPlaylist,
        page: 1,
        pageSize: res.page_size,
        results: res.problems,
        selectedIndex: 0,
      })
      setPlaylistExhausted(false)
      resetPracticeState()
    } catch {
      setError('Failed to restart the practice set. Is the backend running?')
    }
  }

  const handleSubmit = async (
    message: string,
    hintRequested = false,
    answerRequested = false,
  ) => {
    if (!problem) return

    streamAbortRef.current?.abort()
    const controller = new AbortController()
    streamAbortRef.current = controller

    setLoading(true)
    setError(null)
    setStreamingMessage('')

    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      marker: hintRequested ? 'hint' : answerRequested ? 'answer' : undefined,
    }
    const nextHistory = [...history, userMsg]
    setHistory(nextHistory)

    try {
      let accumulated = ''
      for await (const event of streamChat(
        problem.id,
        stage,
        sessionActiveStages,
        history,
        message,
        hintRequested,
        answerRequested,
        conciseMode,
        controller.signal,
      )) {
        if (event.type === 'token') {
          accumulated += event.content
          setStreamingMessage(accumulated)
        } else if (event.type === 'done') {
          setHistory([
            ...nextHistory,
            { role: 'assistant', content: event.message },
          ])
          setStage(event.stage)
          setStreamingMessage('')
          if (event.stage === 'complete' && session) {
            recordAndUpdateStreak()
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      setStreamingMessage('')
    }
  }

  const practiceView = () => {
    if (error && !problem)
      return <div className="text-destructive p-10 text-center">{error}</div>
    if (!problem)
      return (
        <div className="text-muted-foreground p-10 text-center">
          Loading problem...
        </div>
      )
    if (playlistExhausted && problemSource === 'search') {
      return (
        <EndOfSetView
          onRestart={() => void restartSearchSet()}
          onRandom={() => void loadRandomNextProblem()}
        />
      )
    }
    const exitSmartPractice = () => {
      void loadRandomProblem()
    }
    const stagesChanged =
      !stageBannerDismissed &&
      stage !== 'complete' &&
      history.length > 0 &&
      JSON.stringify(activeStages) !== JSON.stringify(sessionActiveStages)
    const exitPlaylist = () => {
      void loadRandomProblem()
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {stagesChanged && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <span>Stage settings changed.</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setHistory([])
                  setStage(activeStages[0])
                  setStreamingMessage('')
                  setSessionActiveStages(activeStages)
                  setStageBannerDismissed(false)
                }}
                className="font-medium underline underline-offset-2 transition-opacity hover:opacity-80"
              >
                Restart with new stages
              </button>
              <button
                onClick={() => setStageBannerDismissed(true)}
                className="opacity-60 transition-opacity hover:opacity-100"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <ProblemView
            key={problem.id}
            problem={problem}
            onSkip={() => void loadNextProblem()}
            onBack={canGoBack ? goBack : undefined}
            onExitPlaylist={
              problemSource === 'search'
                ? exitPlaylist
                : problemSource === 'smart'
                  ? exitSmartPractice
                  : undefined
            }
            smartMode={problemSource === 'smart'}
            playlistSummary={
              problemSource === 'search'
                ? getPlaylistSummary(searchPlaylist)
                : null
            }
            hideTitle={hideTitle}
            hideDifficulty={hideDifficulty}
            isSaved={isSaved(problem.id)}
            onToggleSave={
              session
                ? () => {
                    if (isSaved(problem.id)) {
                      void unsave(problem.id)
                    } else {
                      void save(problem)
                    }
                  }
                : undefined
            }
            onSmartPractice={
              session ? () => void loadSmartPracticeProblem() : undefined
            }
            shuffle={problemSource === 'search' ? shuffle : undefined}
            onToggleShuffle={
              problemSource === 'search'
                ? () => {
                    invalidate()
                    setShuffle((s) => !s)
                  }
                : undefined
            }
          />
          <ChatView
            history={history}
            stage={stage}
            sessionActiveStages={sessionActiveStages}
            loading={loading}
            error={error}
            onSubmit={handleSubmit}
            streamingMessage={streamingMessage}
            onNext={
              stage === 'complete' ? () => void loadNextProblem() : undefined
            }
            onSmartPractice={
              stage === 'complete' && !!session
                ? () => void loadSmartPracticeProblem()
                : undefined
            }
            onBack={stage === 'complete' && canGoBack ? goBack : undefined}
            onHint={
              stage !== 'complete'
                ? () => void handleSubmit('Give me a hint', true, false)
                : undefined
            }
            onAnswer={
              stage !== 'complete'
                ? () => void handleSubmit('Give me the answer', false, true)
                : undefined
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col">
      <NavBar
        view={view}
        onNavigate={setView}
        session={session}
        authLoading={authLoading}
        streak={streak}
        streakStatus={streakStatus}
        activeStages={activeStages}
        onStagesChange={handleStagesChange}
        hideTitle={hideTitle}
        onHideTitleChange={handleHideTitleChange}
        hideDifficulty={hideDifficulty}
        onHideDifficultyChange={handleHideDifficultyChange}
        conciseMode={conciseMode}
        onConciseModeChange={handleConciseModeChange}
        onTakeTour={handleStartTour}
        theme={theme}
        onThemeChange={setTheme}
      />
      {showBanner && (
        <TourBanner onStart={handleStartTour} onDismiss={dismissTour} />
      )}
      {view === 'search' ? (
        <SearchPage
          onSelectProblem={selectProblem}
          onEnterPlaylist={() => void enterPlaylistFromSearch()}
          searchState={searchState}
          onSearchStateChange={setSearchState}
          loading={searchLoading}
          error={searchError}
          availableTags={availableTags}
          tagsLoading={tagsLoading}
          tagsError={tagsError}
          savedIds={savedIds}
          savedProblems={savedProblems}
          onToggleSave={(p) => {
            if (isSaved(p.id)) {
              void unsave(p.id)
            } else {
              void save(p)
            }
          }}
          showSave={!!session}
        />
      ) : view === 'stats' ? (
        <StatsPage
          onSmartPractice={
            session
              ? () => {
                  void loadSmartPracticeProblem()
                  setView('practice')
                }
              : undefined
          }
          activeTopics={activeTopics}
          onTopicsChange={persistTopics}
        />
      ) : view === 'mission' ? (
        <MissionPage />
      ) : (
        // eslint-disable-next-line react-hooks/refs
        practiceView()
      )}
    </div>
  )
}
