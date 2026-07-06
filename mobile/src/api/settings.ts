import type { ActiveStage } from '../types'
import { API_URL, authHeaders } from './client'

export async function getSettings(): Promise<{
  active_stages: ActiveStage[]
  hide_title: boolean
  hide_difficulty: boolean
  concise_mode: boolean
  active_topics: string[]
  tour_done: boolean
}> {
  const res = await fetch(`${API_URL}/api/settings`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get settings: ${res.status}`)
  return res.json()
}

export async function updateSettings(
  activeStages: ActiveStage[],
  hideTitle: boolean,
  hideDifficulty: boolean,
  conciseMode: boolean,
  activeTopics: string[],
  tourDone: boolean,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      active_stages: activeStages,
      hide_title: hideTitle,
      hide_difficulty: hideDifficulty,
      concise_mode: conciseMode,
      active_topics: activeTopics,
      tour_done: tourDone,
    }),
  })
  if (!res.ok) throw new Error(`Failed to update settings: ${res.status}`)
}
