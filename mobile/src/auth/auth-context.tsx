import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getStreak, recordStreak } from '../api/streak'
import { getSettings } from '../api/settings'
import { DEFAULT_STAGES, type ActiveStage } from '../types'

type StreakStatus = 'solid' | 'hollow' | 'none' | null

interface AuthValue {
  session: Session | null
  authReady: boolean
  streak: number | null
  streakStatus: StreakStatus
  activeStages: ActiveStage[]
  hideTitle: boolean
  hideDifficulty: boolean
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

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
      if (sess) {
        getStreak()
          .then(({ streak, last_practiced_at }) => {
            setStreak(streak)
            setLastPracticedAt(last_practiced_at)
          })
          .catch(() => {})
        getSettings()
          .then((s) => {
            setActiveStages(s.active_stages)
            setHideTitle(s.hide_title)
            setHideDifficulty(s.hide_difficulty)
          })
          .catch(() => {})
          .finally(() => setAuthReady(true))
      } else {
        setStreak(null)
        setLastPracticedAt(null)
        setActiveStages(DEFAULT_STAGES)
        setHideTitle(true)
        setHideDifficulty(true)
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
