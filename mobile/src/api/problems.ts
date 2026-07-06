import type {
  Problem,
  ActiveStage,
  ProblemTag,
  ProblemSearchResponse,
} from '../types'
import { API_URL, authHeaders } from './client'
import { ApiError } from './errors'

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

export async function getProblemTags(): Promise<ProblemTag[]> {
  const res = await fetch(`${API_URL}/api/problems/tags`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch tags: ${res.status}`)
  return res.json()
}

function filterParams(
  q: string,
  difficulties: string[],
  tags: string[],
  tagMatch: 'and' | 'or',
): URLSearchParams {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulties.length) params.set('difficulty', difficulties.join(','))
  if (tags.length) params.set('tags', tags.join(','))
  if (tags.length) params.set('tag_match', tagMatch)
  return params
}

export async function searchProblems(
  q: string,
  difficulties: string[],
  tags: string[],
  tagMatch: 'and' | 'or',
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<ProblemSearchResponse> {
  const params = filterParams(q, difficulties, tags, tagMatch)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  const res = await fetch(`${API_URL}/api/problems?${params.toString()}`, {
    headers: await authHeaders(),
    signal,
  })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

export async function getRandomProblemFiltered(
  q: string,
  difficulties: string[],
  tags: string[],
  tagMatch: 'and' | 'or',
  excludeId?: string,
): Promise<Problem> {
  const params = filterParams(q, difficulties, tags, tagMatch)
  if (excludeId) params.set('exclude_id', excludeId)
  const res = await fetch(
    `${API_URL}/api/problems/random?${params.toString()}`,
    { headers: await authHeaders() },
  )
  if (!res.ok)
    throw new ApiError(`Failed to fetch problem: ${res.status}`, res.status)
  return res.json()
}
