import { useState, useEffect } from 'react'
import type { ActiveStage } from '../types'
import { DEFAULT_STAGES, NEETCODE_TOPICS } from '../types'
import { getStreak, recordStreak, getSettings, updateSettings } from '../api'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [streak, setStreak] = useState<number | null>(null)
  const [lastPracticedAt, setLastPracticedAt] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/purity
  const ms = lastPracticedAt === null ? Infinity : Date.now() - new Date(lastPracticedAt).getTime()
  const streakStatus: 'solid' | 'hollow' | 'none' | null =
    lastPracticedAt === null ? null
    : ms < 864e5  ? 'solid'
    : ms < 1728e5 ? 'hollow'
    : 'none'
  const [activeStages, setActiveStages] = useState<ActiveStage[]>(DEFAULT_STAGES)
  const [hideTitle, setHideTitle] = useState(true)
  const [hideDifficulty, setHideDifficulty] = useState(true)
  const [activeTopics, setActiveTopics] = useState<string[]>(NEETCODE_TOPICS)
  const [tourDone, setTourDone] = useState(false)
  const [settingsReady, setSettingsReady] = useState(false)

  const applyLocalSettings = () => {
    const stored = localStorage.getItem('leetgame_active_stages')
    let stages = DEFAULT_STAGES
    if (stored) {
      try { stages = JSON.parse(stored) as ActiveStage[] } catch { /* use default */ }
    }
    const storedHideTitle = localStorage.getItem('leetgame_hide_title')
    const storedHideDifficulty = localStorage.getItem('leetgame_hide_difficulty')
    setActiveStages(stages)
    setHideTitle(storedHideTitle === null ? true : storedHideTitle === 'true')
    setHideDifficulty(storedHideDifficulty === null ? true : storedHideDifficulty === 'true')
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setAuthLoading(false)
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session) {
          getStreak().then(({ streak, last_practiced_at }) => {
            setStreak(streak)
            setLastPracticedAt(last_practiced_at)
          }).catch(() => {})
          getSettings()
            .then(({ active_stages, hide_title, hide_difficulty, active_topics, tour_done }) => {
              setActiveStages(active_stages)
              setHideTitle(hide_title)
              setHideDifficulty(hide_difficulty)
              setActiveTopics(active_topics ?? NEETCODE_TOPICS)
              setTourDone(tour_done)
            })
            .catch(() => {})
            .finally(() => setSettingsReady(true))
        } else {
          setStreak(null)
          setLastPracticedAt(null)
          applyLocalSettings()
          setSettingsReady(true)
        }
      } else if (event === 'SIGNED_OUT') {
        setStreak(null)
        setLastPracticedAt(null)
        setActiveTopics(NEETCODE_TOPICS)
        applyLocalSettings()
        setSettingsReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const persistStages = (stages: ActiveStage[]) => {
    setActiveStages(stages)
    if (session) {
      updateSettings(stages, hideTitle, hideDifficulty, activeTopics, tourDone).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_active_stages', JSON.stringify(stages))
      } catch { /* ignore */ }
    }
  }

  const persistHideTitle = (value: boolean) => {
    setHideTitle(value)
    if (session) {
      updateSettings(activeStages, value, hideDifficulty, activeTopics, tourDone).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_hide_title', String(value))
      } catch { /* ignore */ }
    }
  }

  const persistHideDifficulty = (value: boolean) => {
    setHideDifficulty(value)
    if (session) {
      updateSettings(activeStages, hideTitle, value, activeTopics, tourDone).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_hide_difficulty', String(value))
      } catch { /* ignore */ }
    }
  }

  const persistTopics = (topics: string[]) => {
    setActiveTopics(topics)
    if (session) {
      updateSettings(activeStages, hideTitle, hideDifficulty, topics, tourDone).catch(() => {})
    }
  }

  const persistTourDone = () => {
    setTourDone(true)
    if (session) {
      updateSettings(activeStages, hideTitle, hideDifficulty, activeTopics, true).catch(() => {})
    }
  }

  const recordAndUpdateStreak = () => {
    recordStreak().then(({ streak, last_practiced_at }) => {
      setStreak(streak)
      setLastPracticedAt(last_practiced_at)
    }).catch(() => {})
  }

  return {
    session,
    authLoading,
    streak,
    streakStatus,
    activeStages,
    hideTitle,
    hideDifficulty,
    activeTopics,
    tourDone,
    settingsReady,
    persistStages,
    persistHideTitle,
    persistHideDifficulty,
    persistTopics,
    persistTourDone,
    recordAndUpdateStreak,
  }
}
