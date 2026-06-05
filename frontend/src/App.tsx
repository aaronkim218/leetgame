import { useEffect, useState, useRef } from 'react'
import type { Problem, ChatMessage, Stage, ActiveStage, SearchState, View } from './types'
import { defaultSearchState } from './types'
import { getRandomProblem, getRandomProblemFiltered, searchProblems, streamChat, getSmartPracticeProblem } from './api'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import { useSearch, SEARCH_PAGE_SIZE } from './hooks/useSearch'
import { useTags } from './hooks/useTags'
import { useSaved } from './hooks/useSaved'
import { NavBar } from './components/NavBar'
import { ProblemView } from './components/ProblemView'
import { ChatView } from './components/ChatView'
import { EndOfSetView } from './components/EndOfSetView'
import { SearchPage, type SearchSelectionContext } from './components/SearchPage'
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
}

interface SearchPlaylist {
  q: string
  difficulty: string
  tags: string[]
  tagMatch: 'and' | 'or'
  page: number
  pageSize: number
  results: Problem[]
  selectedIndex: number
}

function getPlaylistSummary(searchPlaylist: SearchPlaylist | null) {
  if (!searchPlaylist) return null

  if (!searchPlaylist.q && !searchPlaylist.difficulty && searchPlaylist.tags.length === 0) {
    return null
  }

  return {
    q: searchPlaylist.q,
    difficulty: searchPlaylist.difficulty,
    tags: searchPlaylist.tags,
    tagMatch: searchPlaylist.tagMatch,
  }
}

export default function App() {
  const { session, authLoading, streak, streakStatus, activeStages, hideTitle, activeTopics, tourDone, settingsReady, persistStages, persistHideTitle, persistTopics, persistTourDone, recordAndUpdateStreak } = useAuth()
  const { showBanner, dismiss: dismissTour, markDone: markTourDone } = useTour(!!session, settingsReady, tourDone, persistTourDone)

  const handleStartTour = () => {
    if (view !== 'practice') setView('practice')
    setTimeout(() => {
      startTour(markTourDone, !!session)
    }, view !== 'practice' ? 100 : 0)
  }

  const [view, setView] = useState<View>('practice')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [problemSource, setProblemSource] = useState<ProblemSource>('random')
  const [searchPlaylist, setSearchPlaylist] = useState<SearchPlaylist | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [stage, setStage] = useState<Stage>('pattern')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playlistExhausted, setPlaylistExhausted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [sessionActiveStages, setSessionActiveStages] = useState<ActiveStage[]>(activeStages)
  const [stageBannerDismissed, setStageBannerDismissed] = useState(false)
  const [sessionStack, setSessionStack] = useState<PracticeSnapshot[]>([])
  const [searchState, setSearchState] = useState<SearchState>(defaultSearchState)
  const { loading: searchLoading, error: searchError } = useSearch(searchState, setSearchState)
  const { availableTags, tagsLoading, tagsError } = useTags()
  const { savedProblems, savedIds, save, unsave, isSaved } = useSaved(session)
  const { theme, setTheme } = useTheme()
  const playlistEntryDepthRef = useRef<number>(0)
  const streamAbortRef = useRef<AbortController | null>(null)

  const resetPracticeState = () => {
    setHistory([])
    setStage(activeStages[0])
    setStreamingMessage('')
    setSessionActiveStages(activeStages)
    setStageBannerDismissed(false)
  }

  const pushSnapshot = () => {
    if (!problem) return
    setSessionStack(s => [...s, { problem, stage, history, searchPlaylist, problemSource, shuffle }])
  }

  const goBack = () => {
    if (sessionStack.length === 0) return
    const snap = sessionStack[sessionStack.length - 1]
    setProblem(snap.problem)
    setStage(snap.stage)
    setHistory(snap.history)
    setSearchPlaylist(snap.searchPlaylist)
    setProblemSource(snap.problemSource)
    setShuffle(snap.shuffle)
    setPlaylistExhausted(false)
    setError(null)
    setStreamingMessage('')
    setSessionStack(s => s.slice(0, -1))
  }

  const handleStagesChange = (stages: ActiveStage[]) => {
    persistStages(stages)
    setStageBannerDismissed(false)
  }

  const handleHideTitleChange = (value: boolean) => {
    persistHideTitle(value)
  }

  const loadRandomProblem = async () => {
    try {
      pushSnapshot()
      setError(null)
      setPlaylistExhausted(false)
      const p = await getRandomProblem()
      setProblem(p)
      setProblemSource('random')
      setSearchPlaylist(null)
      resetPracticeState()
    } catch {
      setError('Failed to load problem. Is the backend running?')
    }
  }

  const loadNextSearchProblem = async () => {
    if (!searchPlaylist) {
      await loadRandomProblem()
      return
    }

    const nextIndex = searchPlaylist.selectedIndex + 1
    if (nextIndex < searchPlaylist.results.length) {
      pushSnapshot()
      setProblem(searchPlaylist.results[nextIndex])
      setSearchPlaylist({
        ...searchPlaylist,
        selectedIndex: nextIndex,
      })
      resetPracticeState()
      setPlaylistExhausted(false)
      setError(null)
      return
    }

    const nextPage = searchPlaylist.page + 1

    try {
      pushSnapshot()
      setError(null)
      const res = await searchProblems(
        searchPlaylist.q,
        searchPlaylist.difficulty,
        searchPlaylist.tags,
        searchPlaylist.tagMatch,
        nextPage,
        searchPlaylist.pageSize,
      )

      if (res.problems.length === 0) {
        setPlaylistExhausted(true)
        setError(null)
        return
      }

      setProblem(res.problems[0])
      setSearchPlaylist({
        ...searchPlaylist,
        page: res.page,
        pageSize: res.page_size,
        results: res.problems,
        selectedIndex: 0,
      })
      resetPracticeState()
      setPlaylistExhausted(false)
    } catch {
      setError('Failed to load the next filtered problem. Is the backend running?')
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
    await loadRandomProblem()
  }

  const loadRandomNextProblem = async () => {
    if (problemSource === 'search' && searchPlaylist) {
      try {
        pushSnapshot()
        setError(null)
        const p = await getRandomProblemFiltered(
          searchPlaylist.q,
          searchPlaylist.difficulty,
          searchPlaylist.tags,
          searchPlaylist.tagMatch,
          problem?.id,
        )
        setProblem(p)
        resetPracticeState()
        setPlaylistExhausted(false)
        return
      } catch {
        setError('Failed to load a random filtered problem. Is the backend running?')
        return
      }
    }

    await loadRandomProblem()
  }

  const loadSmartPracticeProblem = async () => {
    try {
      pushSnapshot()
      setError(null)
      setPlaylistExhausted(false)
      const p = await getSmartPracticeProblem(activeStages, activeTopics)
      setProblem(p)
      setProblemSource('smart')
      setSearchPlaylist(null)
      resetPracticeState()
    } catch {
      setError('Failed to load smart practice problem. Is the backend running?')
    }
  }

  const enterPlaylistFromSearch = async () => {
    const { q, difficulty, tags, tagMatch } = searchState
    try {
      pushSnapshot()
      setError(null)
      setPlaylistExhausted(false)
      setShuffle(true)
      playlistEntryDepthRef.current = sessionStack.length + (problem ? 1 : 0)
      const p = await getRandomProblemFiltered(q, difficulty, tags, tagMatch)
      setProblem(p)
      setProblemSource('search')
      setSearchPlaylist({
        q,
        difficulty,
        tags,
        tagMatch,
        page: 0,
        pageSize: SEARCH_PAGE_SIZE,
        results: [],
        selectedIndex: -1,
      })
      resetPracticeState()
      setView('practice')
    } catch {
      setError('Failed to load a problem with those filters. Is the backend running?')
    }
  }

  const selectProblem = (p: Problem, context: SearchSelectionContext) => {
    pushSnapshot()
    playlistEntryDepthRef.current = sessionStack.length + (problem ? 1 : 0)
    setShuffle(false)
    setProblem(p)
    setProblemSource('search')
    setPlaylistExhausted(false)
    setSearchPlaylist({
      q: context.q,
      difficulty: context.difficulty,
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

  useEffect(() => () => {
    streamAbortRef.current?.abort()
  }, [problem])

  const restartSearchSet = async () => {
    if (!searchPlaylist) return

    try {
      setError(null)
      const res = await searchProblems(
        searchPlaylist.q,
        searchPlaylist.difficulty,
        searchPlaylist.tags,
        searchPlaylist.tagMatch,
        1,
        searchPlaylist.pageSize,
      )

      if (res.problems.length === 0) {
        setError('No problems match the current practice set.')
        return
      }

      pushSnapshot()
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

  const handleSubmit = async (message: string, hintRequested = false, answerRequested = false) => {
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
      for await (const event of streamChat(problem.id, stage, sessionActiveStages, history, message, hintRequested, answerRequested, controller.signal)) {
        if (event.type === 'token') {
          accumulated += event.content
          setStreamingMessage(accumulated)
        } else if (event.type === 'done') {
          setHistory([...nextHistory, { role: 'assistant', content: event.message }])
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
    if (error && !problem) return (
      <div className="p-10 text-center text-destructive">{error}</div>
    )
    if (!problem) return (
      <div className="p-10 text-center text-muted-foreground">Loading problem...</div>
    )
    if (playlistExhausted && problemSource === 'search') {
      return (
        <EndOfSetView
          onRestart={() => void restartSearchSet()}
          onRandom={() => void loadRandomNextProblem()}
        />
      )
    }
    const canGoBack = problemSource === 'search'
      ? sessionStack.length > playlistEntryDepthRef.current
      : sessionStack.length > 0
    const exitSmartPractice = () => {
      setSessionStack([])
      void loadRandomProblem()
    }
    const stagesChanged = !stageBannerDismissed &&
      stage !== 'complete' &&
      history.length > 0 &&
      JSON.stringify(activeStages) !== JSON.stringify(sessionActiveStages)
    const exitPlaylist = () => {
      playlistEntryDepthRef.current = 0
      setSessionStack([])
      void loadRandomProblem()
    }
    return (
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      {stagesChanged && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200 shrink-0">
          <span>Stage settings changed.</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setHistory([]); setStage(activeStages[0]); setStreamingMessage(''); setSessionActiveStages(activeStages); setStageBannerDismissed(false) }}
              className="font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Restart with new stages
            </button>
            <button
              onClick={() => setStageBannerDismissed(true)}
              className="opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
        <ProblemView
          key={problem.id}
          problem={problem}
          onSkip={() => void loadNextProblem()}
          onBack={canGoBack ? goBack : undefined}
          onExitPlaylist={problemSource === 'search' ? exitPlaylist : problemSource === 'smart' ? exitSmartPractice : undefined}
          smartMode={problemSource === 'smart'}
          playlistSummary={problemSource === 'search' ? getPlaylistSummary(searchPlaylist) : null}
          hideTitle={hideTitle}
          isSaved={isSaved(problem.id)}
          onToggleSave={session ? () => { if (isSaved(problem.id)) { void unsave(problem.id) } else { void save(problem) } } : undefined}
          onSmartPractice={session ? () => void loadSmartPracticeProblem() : undefined}
          shuffle={problemSource === 'search' ? shuffle : undefined}
          onToggleShuffle={problemSource === 'search' ? () => setShuffle(s => !s) : undefined}
        />
        <ChatView
          history={history}
          stage={stage}
          sessionActiveStages={sessionActiveStages}
          loading={loading}
          error={error}
          onSubmit={handleSubmit}
          streamingMessage={streamingMessage}
          onNext={stage === 'complete' ? () => void loadNextProblem() : undefined}
          onSmartPractice={stage === 'complete' && !!session ? () => void loadSmartPracticeProblem() : undefined}
          onBack={stage === 'complete' && canGoBack ? goBack : undefined}
          onHint={stage !== 'complete' ? () => void handleSubmit('Give me a hint', true, false) : undefined}
          onAnswer={stage !== 'complete' ? () => void handleSubmit('Give me the answer', false, true) : undefined}
        />
      </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-dvh">
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
        onTakeTour={handleStartTour}
        theme={theme}
        onThemeChange={setTheme}
      />
      {showBanner && (
        <TourBanner onStart={handleStartTour} onDismiss={dismissTour} />
      )}
      {view === 'search'
        ? <SearchPage
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
            onToggleSave={(p) => { if (isSaved(p.id)) { void unsave(p.id) } else { void save(p) } }}
            showSave={!!session}
          />
        : view === 'stats'
        ? <StatsPage
            onSmartPractice={session ? () => { void loadSmartPracticeProblem(); setView('practice') } : undefined}
            activeTopics={activeTopics}
            onTopicsChange={persistTopics}
          />
        : view === 'mission'
        ? <MissionPage />
        // eslint-disable-next-line react-hooks/refs
        : practiceView()
      }
    </div>
  )
}
