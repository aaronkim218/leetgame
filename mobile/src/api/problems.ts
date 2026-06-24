import type { Problem, ActiveStage } from '../types'
import { API_URL, authHeaders } from './client'

export async function getRandomProblem(): Promise<Problem> {
  const res = await fetch(`${API_URL}/api/problems/random`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch problem: ${res.status}`)
  return res.json()
}

export async function getSmartPracticeProblem(
  activeStages: ActiveStage[],
  activeTopics: string[],
): Promise<Problem> {
  const params = new URLSearchParams()
  params.set('active_stages', activeStages.join(','))
  if (activeTopics.length) params.set('active_topics', activeTopics.join(','))
  const res = await fetch(
    `${API_URL}/api/problems/smart?${params.toString()}`,
    { headers: await authHeaders() },
  )
  if (!res.ok)
    throw new Error(`Failed to fetch smart practice problem: ${res.status}`)
  return res.json()
}
