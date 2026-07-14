import { useState, useEffect } from 'react'
import type { ProblemTag } from '../types'
import { getProblemTags } from '../api'

// module-scoped: the tag catalog is global and static, cache for app lifetime
let cachedTags: ProblemTag[] | null = null

export function useTags(): {
  availableTags: ProblemTag[]
  tagsLoading: boolean
  tagsError: string | null
} {
  const [availableTags, setAvailableTags] = useState<ProblemTag[]>(
    () => cachedTags ?? [],
  )
  const [tagsLoading, setTagsLoading] = useState(cachedTags === null)
  const [tagsError, setTagsError] = useState<string | null>(null)

  useEffect(() => {
    if (cachedTags !== null) return
    const controller = new AbortController()
    async function loadTags() {
      setTagsLoading(true)
      setTagsError(null)
      try {
        const res = await getProblemTags(controller.signal)
        cachedTags = res
        setAvailableTags(res)
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setTagsError('Failed to load tags.')
        }
      } finally {
        if (!controller.signal.aborted) setTagsLoading(false)
      }
    }
    void loadTags()
    return () => controller.abort()
  }, [])

  return { availableTags, tagsLoading, tagsError }
}
