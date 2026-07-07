import { useCallback, useRef } from 'react'
import type { Problem } from '../types'
import { getRandomProblemFiltered } from '../api/problems'
import { ApiError } from '../api/errors'

export interface PrefetchContext {
  q: string
  difficulties: string[]
  tags: string[]
  tagMatch: 'and' | 'or'
  excludeId?: string
}

export type PrefetchResult = { problem: Problem } | { exhausted: true }

function contextKey(ctx: PrefetchContext): string {
  return JSON.stringify([
    ctx.q,
    [...ctx.difficulties].sort(),
    [...ctx.tags].sort(),
    ctx.tagMatch,
    ctx.excludeId ?? '',
  ])
}

interface Slot {
  key: string
  result: PrefetchResult | null // null while the fetch is in flight
}

export function usePrefetchedProblem() {
  const slotRef = useRef<Slot | null>(null)

  const prefetch = useCallback((ctx: PrefetchContext) => {
    const key = contextKey(ctx)
    slotRef.current = { key, result: null }
    void getRandomProblemFiltered(
      ctx.q,
      ctx.difficulties,
      ctx.tags,
      ctx.tagMatch,
      ctx.excludeId,
    )
      .then((problem) => {
        if (slotRef.current?.key !== key) return
        slotRef.current = { key, result: { problem } }
      })
      .catch((e: unknown) => {
        if (slotRef.current?.key !== key) return
        if (e instanceof ApiError && e.status === 404) {
          slotRef.current = { key, result: { exhausted: true } }
        } else {
          slotRef.current = null
        }
      })
  }, [])

  const take = useCallback((ctx: PrefetchContext): PrefetchResult | null => {
    const slot = slotRef.current
    if (!slot || slot.key !== contextKey(ctx) || !slot.result) return null
    slotRef.current = null
    return slot.result
  }, [])

  const invalidate = useCallback(() => {
    slotRef.current = null
  }, [])

  return { prefetch, take, invalidate }
}
