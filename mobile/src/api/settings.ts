import type { ActiveStage } from '../types'
import { API_URL, authHeaders } from './client'

export async function getSettings(): Promise<{
  active_stages: ActiveStage[]
  hide_title: boolean
  hide_difficulty: boolean
  active_topics: string[]
  tour_done: boolean
}> {
  const res = await fetch(`${API_URL}/api/settings`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get settings: ${res.status}`)
  return res.json()
}
