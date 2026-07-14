import { useEffect, useState } from 'react'
import type {
  TopicProficiency,
  ProficiencySnapshot,
  TrendWindow,
} from '../types'
import { getProficiency, getProficiencyHistory } from '../api'

// module-scoped: stats only change on session completion, so cache across
// mounts (history per window) and clear via invalidateStatsCache() at the
// two invalidation sites; mounted consumers re-check on remount by design
let cachedProficiency: TopicProficiency[] | null = null
let cachedHistory = new Map<TrendWindow, ProficiencySnapshot[]>()
// bumped on invalidate so an in-flight fetch can't repopulate stale data
let cacheGeneration = 0

export function invalidateStatsCache(): void {
  cacheGeneration++
  cachedProficiency = null
  cachedHistory = new Map()
}

export function useStats(window: TrendWindow): {
  proficiencies: TopicProficiency[]
  history: ProficiencySnapshot[]
  loading: boolean
  historyLoading: boolean
  error: boolean
} {
  const [proficiencies, setProficiencies] = useState<TopicProficiency[]>(
    () => cachedProficiency ?? [],
  )
  const [history, setHistory] = useState<ProficiencySnapshot[]>(
    () => cachedHistory.get(window) ?? [],
  )
  const [loading, setLoading] = useState(cachedProficiency === null)
  const [historyLoading, setHistoryLoading] = useState(
    !cachedHistory.has(window),
  )
  const [error, setError] = useState(false)

  useEffect(() => {
    const prof = cachedProficiency
    const hist = cachedHistory.get(window)
    if (prof !== null && hist !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProficiencies(prof)
      setHistory(hist)
      setLoading(false)
      setHistoryLoading(false)
      setError(false)
      return
    }
    const controller = new AbortController()
    const generation = cacheGeneration
    setHistoryLoading(true)
    Promise.all([
      prof !== null ? Promise.resolve(prof) : getProficiency(controller.signal),
      getProficiencyHistory(window, controller.signal),
    ])
      .then(([p, h]) => {
        if (controller.signal.aborted) return
        if (generation === cacheGeneration) {
          cachedProficiency = p
          cachedHistory.set(window, h)
        }
        setProficiencies(p)
        setHistory(h)
        setError(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
          setHistoryLoading(false)
        }
      })
    return () => controller.abort()
  }, [window])

  return { proficiencies, history, loading, historyLoading, error }
}
