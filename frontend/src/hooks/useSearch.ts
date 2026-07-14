import { useState, useEffect, useRef } from 'react'
import type { SearchState } from '../types'
import { searchProblems } from '../api'

export const SEARCH_PAGE_SIZE = 12

export function useSearch(
  searchState: SearchState,
  onSearchStateChange: (s: SearchState) => void,
): { loading: boolean; error: string | null } {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const searchStateRef = useRef(searchState)
  useEffect(() => {
    searchStateRef.current = searchState
  })

  const { q, difficulties, tags, tagMatch, page } = searchState
  // arrays in deps by value, not reference
  const difficultiesKey = difficulties.join(',')
  const tagsKey = tags.join(',')

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(null)
      try {
        const {
          q: sq,
          difficulties: sd,
          tags: st,
          tagMatch: sm,
          page: sp,
        } = searchStateRef.current
        const res = await searchProblems(
          sq,
          sd,
          st,
          sm,
          sp,
          SEARCH_PAGE_SIZE,
          controller.signal,
        )
        // only writes results/total/hasSearched — none of which are in the effect deps, so no loop
        onSearchStateChange({
          ...searchStateRef.current,
          results: res.problems,
          total: res.total,
          hasSearched: true,
        })
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Search failed. Is the backend running?')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [q, difficultiesKey, tagsKey, tagMatch, page, onSearchStateChange])

  return { loading, error }
}
