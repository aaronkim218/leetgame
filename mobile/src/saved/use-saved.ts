import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Problem } from '../types'
import { getSavedProblems, saveProblem, unsaveProblem } from '../api/saved'

export function useSaved(session: Session | null): {
  savedProblems: Problem[]
  savedIds: Set<string>
  save: (problem: Problem) => Promise<void>
  unsave: (problemId: string) => Promise<void>
  isSaved: (problemId: string) => boolean
} {
  const [savedProblems, setSavedProblems] = useState<Problem[]>([])
  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!userId) {
      setSavedProblems([])
      return
    }
    getSavedProblems()
      .then(setSavedProblems)
      .catch(() => {})
  }, [userId])

  const savedIds = useMemo(
    () => new Set(savedProblems.map((p) => p.id)),
    [savedProblems],
  )

  const save = async (problem: Problem) => {
    setSavedProblems((prev) =>
      prev.some((p) => p.id === problem.id) ? prev : [...prev, problem],
    )
    await saveProblem(problem.id).catch(() => {
      getSavedProblems()
        .then(setSavedProblems)
        .catch(() => {})
    })
  }

  const unsave = async (problemId: string) => {
    setSavedProblems((prev) => prev.filter((p) => p.id !== problemId))
    await unsaveProblem(problemId).catch(() => {
      getSavedProblems()
        .then(setSavedProblems)
        .catch(() => {})
    })
  }

  const isSaved = (problemId: string) => savedIds.has(problemId)

  return { savedProblems, savedIds, save, unsave, isSaved }
}
