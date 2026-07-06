import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getStreak, recordStreak } from '../api/streak'
import { getSettings, updateSettings } from '../api/settings'
import { DEFAULT_STAGES, NEETCODE_TOPICS, type ActiveStage } from '../types'

type StreakStatus = 'solid' | 'hollow' | 'none' | null

interface AuthValue {
  session: Session | null
  authReady: boolean
  streak: number | null
  streakStatus: StreakStatus
  activeStages: ActiveStage[]
  hideTitle: boolean
  hideDifficulty: boolean
  conciseMode: boolean
  activeTopics: string[]
  persistStages: (stages: ActiveStage[]) => void
  persistHideTitle: (value: boolean) => void
  persistHideDifficulty: (value: boolean) => void
  persistConciseMode: (value: boolean) => void
  persistTopics: (topics: string[]) => void
  signOut: () => Promise<void>
  refreshStreak: () => void
}

const AuthCtx = createContext<AuthValue | null>(null)

function computeStatus(lastPracticedAt: string | null): StreakStatus {
  if (lastPracticedAt === null) return null
  const ms = Date.now() - new Date(lastPracticedAt).getTime()
  if (ms < 864e5) return 'solid'
  if (ms < 1728e5) return 'hollow'
  return 'none'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [streak, setStreak] = useState<number | null>(null)
  const [lastPracticedAt, setLastPracticedAt] = useState<string | null>(null)
  const [activeStages, setActiveStages] =
    useState<ActiveStage[]>(DEFAULT_STAGES)
  const [hideTitle, setHideTitle] = useState(true)
  const [hideDifficulty, setHideDifficulty] = useState(true)
  const [conciseMode, setConciseMode] = useState(false)
  const [activeTopics, setActiveTopics] = useState<string[]>(NEETCODE_TOPICS)
  const [tourDone, setTourDone] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    let settingsSeq = 0
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
      if (sess) {
        const seq = ++settingsSeq
        setSettingsLoaded(false)
        getStreak()
          .then(({ streak, last_practiced_at }) => {
            setStreak(streak)
            setLastPracticedAt(last_practiced_at)
          })
          .catch(() => {})
        getSettings()
          .then((s) => {
            if (seq !== settingsSeq) return
            setActiveStages(s.active_stages)
            setHideTitle(s.hide_title)
            setHideDifficulty(s.hide_difficulty)
            setConciseMode(s.concise_mode)
            setActiveTopics(s.active_topics ?? NEETCODE_TOPICS)
            setTourDone(s.tour_done)
            setSettingsLoaded(true)
          })
          .catch(() => {})
          .finally(() => {
            if (seq === settingsSeq) setAuthReady(true)
          })
      } else {
        settingsSeq++
        setStreak(null)
        setLastPracticedAt(null)
        setActiveStages(DEFAULT_STAGES)
        setHideTitle(true)
        setHideDifficulty(true)
        setConciseMode(false)
        setActiveTopics(NEETCODE_TOPICS)
        setTourDone(false)
        setSettingsLoaded(false)
        setAuthReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const refreshStreak = useCallback(() => {
    recordStreak()
      .then(({ streak, last_practiced_at }) => {
        setStreak(streak)
        setLastPracticedAt(last_practiced_at)
      })
      .catch(() => {})
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const persist = (
    stages: ActiveStage[],
    title: boolean,
    difficulty: boolean,
    concise: boolean,
    topics: string[],
  ) => {
    if (!session || !settingsLoaded) return
    updateSettings(stages, title, difficulty, concise, topics, tourDone).catch(
      () => {},
    )
  }

  const persistStages = (stages: ActiveStage[]) => {
    setActiveStages(stages)
    persist(stages, hideTitle, hideDifficulty, conciseMode, activeTopics)
  }
  const persistHideTitle = (value: boolean) => {
    setHideTitle(value)
    persist(activeStages, value, hideDifficulty, conciseMode, activeTopics)
  }
  const persistHideDifficulty = (value: boolean) => {
    setHideDifficulty(value)
    persist(activeStages, hideTitle, value, conciseMode, activeTopics)
  }
  const persistConciseMode = (value: boolean) => {
    setConciseMode(value)
    persist(activeStages, hideTitle, hideDifficulty, value, activeTopics)
  }
  const persistTopics = (topics: string[]) => {
    setActiveTopics(topics)
    persist(activeStages, hideTitle, hideDifficulty, conciseMode, topics)
  }

  return (
    <AuthCtx.Provider
      value={{
        session,
        authReady,
        streak,
        streakStatus: computeStatus(lastPracticedAt),
        activeStages,
        hideTitle,
        hideDifficulty,
        conciseMode,
        activeTopics,
        persistStages,
        persistHideTitle,
        persistHideDifficulty,
        persistConciseMode,
        persistTopics,
        signOut,
        refreshStreak,
      }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
