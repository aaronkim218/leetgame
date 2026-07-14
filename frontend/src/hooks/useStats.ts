import { useEffect, useState } from 'react'
import type { TopicProficiency, ProficiencySnapshot } from '../types'
import { getProficiency, getProficiencyHistory } from '../api'

// module-scoped: stats only change on session completion, so cache across
// mounts and clear via invalidateStatsCache() at the two invalidation sites
let cachedProficiency: TopicProficiency[] | null = null
let cachedHistory: ProficiencySnapshot[] | null = null

export function invalidateStatsCache(): void {
  cachedProficiency = null
  cachedHistory = null
}

export function useStats(): {
  proficiencies: TopicProficiency[]
  history: ProficiencySnapshot[]
  loading: boolean
  error: boolean
} {
  const [proficiencies, setProficiencies] = useState<TopicProficiency[]>(
    () => cachedProficiency ?? [],
  )
  const [history, setHistory] = useState<ProficiencySnapshot[]>(
    () => cachedHistory ?? [],
  )
  const [loading, setLoading] = useState(
    cachedProficiency === null || cachedHistory === null,
  )
  const [error, setError] = useState(false)

  useEffect(() => {
    if (cachedProficiency !== null && cachedHistory !== null) return
    const controller = new AbortController()
    Promise.all([
      getProficiency(controller.signal),
      getProficiencyHistory(controller.signal),
    ])
      .then(([prof, hist]) => {
        if (controller.signal.aborted) return
        cachedProficiency = prof
        cachedHistory = hist
        setProficiencies(prof)
        setHistory(hist)
        setError(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  return { proficiencies, history, loading, error }
}
