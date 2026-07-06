import { useState, useEffect } from 'react'
import type { ActiveStage } from '../types'
import { DEFAULT_STAGES, NEETCODE_TOPICS } from '../types'
import { getStreak, recordStreak, getSettings, updateSettings } from '../api'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!new URLSearchParams(window.location.search).has('dev')) return
    const email = import.meta.env.VITE_DEV_EMAIL as string | undefined
    const password = import.meta.env.VITE_DEV_PASSWORD as string | undefined
    if (email && password) {
      supabase.auth.signInWithPassword({ email, password }).catch(() => {})
    }
  }, [])
  const [streak, setStreak] = useState<number | null>(null)
  const [lastPracticedAt, setLastPracticedAt] = useState<string | null>(null)
  const ms =
    lastPracticedAt === null
      ? Infinity
      : // eslint-disable-next-line react-hooks/purity
        Date.now() - new Date(lastPracticedAt).getTime()
  const streakStatus: 'solid' | 'hollow' | 'none' | null =
    lastPracticedAt === null
      ? null
      : ms < 864e5
        ? 'solid'
        : ms < 1728e5
          ? 'hollow'
          : 'none'
  const [activeStages, setActiveStages] =
    useState<ActiveStage[]>(DEFAULT_STAGES)
  const [hideTitle, setHideTitle] = useState(true)
  const [hideDifficulty, setHideDifficulty] = useState(true)
  const [conciseMode, setConciseMode] = useState(false)
  const [activeTopics, setActiveTopics] = useState<string[]>(NEETCODE_TOPICS)
  const [tourDone, setTourDone] = useState(false)
  const [settingsReady, setSettingsReady] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  const applyLocalSettings = () => {
    const stored = localStorage.getItem('leetgame_active_stages')
    let stages = DEFAULT_STAGES
    if (stored) {
      try {
        stages = JSON.parse(stored) as ActiveStage[]
      } catch {
        /* use default */
      }
    }
    const storedHideTitle = localStorage.getItem('leetgame_hide_title')
    const storedHideDifficulty = localStorage.getItem(
      'leetgame_hide_difficulty',
    )
    const storedConciseMode = localStorage.getItem('leetgame_concise_mode')
    setActiveStages(stages)
    setHideTitle(storedHideTitle === null ? true : storedHideTitle === 'true')
    setHideDifficulty(
      storedHideDifficulty === null ? true : storedHideDifficulty === 'true',
    )
    setConciseMode(storedConciseMode === 'true')
  }

  useEffect(() => {
    let settingsSeq = 0
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setAuthLoading(false)
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session) {
          const seq = ++settingsSeq
          setSettingsLoaded(false)
          getStreak()
            .then(({ streak, last_practiced_at }) => {
              setStreak(streak)
              setLastPracticedAt(last_practiced_at)
            })
            .catch(() => {})
          getSettings()
            .then(
              ({
                active_stages,
                hide_title,
                hide_difficulty,
                concise_mode,
                active_topics,
                tour_done,
              }) => {
                if (seq !== settingsSeq) return
                setActiveStages(active_stages)
                setHideTitle(hide_title)
                setHideDifficulty(hide_difficulty)
                setConciseMode(concise_mode)
                setActiveTopics(active_topics ?? NEETCODE_TOPICS)
                setTourDone(tour_done)
                setSettingsLoaded(true)
              },
            )
            .catch(() => {})
            .finally(() => {
              if (seq === settingsSeq) setSettingsReady(true)
            })
        } else {
          settingsSeq++
          setStreak(null)
          setLastPracticedAt(null)
          applyLocalSettings()
          setSettingsLoaded(false)
          setSettingsReady(true)
        }
      } else if (event === 'SIGNED_OUT') {
        settingsSeq++
        setStreak(null)
        setLastPracticedAt(null)
        setActiveTopics(NEETCODE_TOPICS)
        applyLocalSettings()
        setSettingsLoaded(false)
        setSettingsReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const persistStages = (stages: ActiveStage[]) => {
    setActiveStages(stages)
    if (session) {
      if (!settingsLoaded) return
      updateSettings(
        stages,
        hideTitle,
        hideDifficulty,
        conciseMode,
        activeTopics,
        tourDone,
      ).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_active_stages', JSON.stringify(stages))
      } catch {
        /* ignore */
      }
    }
  }

  const persistHideTitle = (value: boolean) => {
    setHideTitle(value)
    if (session) {
      if (!settingsLoaded) return
      updateSettings(
        activeStages,
        value,
        hideDifficulty,
        conciseMode,
        activeTopics,
        tourDone,
      ).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_hide_title', String(value))
      } catch {
        /* ignore */
      }
    }
  }

  const persistHideDifficulty = (value: boolean) => {
    setHideDifficulty(value)
    if (session) {
      if (!settingsLoaded) return
      updateSettings(
        activeStages,
        hideTitle,
        value,
        conciseMode,
        activeTopics,
        tourDone,
      ).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_hide_difficulty', String(value))
      } catch {
        /* ignore */
      }
    }
  }

  const persistConciseMode = (value: boolean) => {
    setConciseMode(value)
    if (session) {
      if (!settingsLoaded) return
      updateSettings(
        activeStages,
        hideTitle,
        hideDifficulty,
        value,
        activeTopics,
        tourDone,
      ).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_concise_mode', String(value))
      } catch {
        /* ignore */
      }
    }
  }

  const persistTopics = (topics: string[]) => {
    setActiveTopics(topics)
    if (session && settingsLoaded) {
      updateSettings(
        activeStages,
        hideTitle,
        hideDifficulty,
        conciseMode,
        topics,
        tourDone,
      ).catch(() => {})
    }
  }

  const persistTourDone = () => {
    setTourDone(true)
    if (session && settingsLoaded) {
      updateSettings(
        activeStages,
        hideTitle,
        hideDifficulty,
        conciseMode,
        activeTopics,
        true,
      ).catch(() => {})
    }
  }

  const recordAndUpdateStreak = () => {
    recordStreak()
      .then(({ streak, last_practiced_at }) => {
        setStreak(streak)
        setLastPracticedAt(last_practiced_at)
      })
      .catch(() => {})
  }

  return {
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
  }
}
