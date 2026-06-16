import type {
  Problem,
  ChatMessage,
  Stage,
  ActiveStage,
  ProblemSearchResponse,
  ProblemTag,
  TopicProficiency,
  ProficiencySnapshot,
} from './types'
import { supabase } from './lib/supabase'

const API_URL = import.meta.env.VITE_API_URL ?? ''

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

export async function getRandomProblem(): Promise<Problem> {
  const res = await fetch(`${API_URL}/api/problems/random`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch problem: ${res.status}`)
  return res.json()
}

export async function getRandomProblemFiltered(
  q: string,
  difficulties: string[],
  tags: string[],
  tagMatch: 'and' | 'or',
  excludeId?: string,
): Promise<Problem> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulties.length) params.set('difficulty', difficulties.join(','))
  if (tags.length) params.set('tags', tags.join(','))
  if (tags.length) params.set('tag_match', tagMatch)
  if (excludeId) params.set('exclude_id', excludeId)
  const res = await fetch(
    `${API_URL}/api/problems/random?${params.toString()}`,
    {
      headers: await authHeaders(),
    },
  )
  if (!res.ok)
    throw new Error(`Failed to fetch filtered random problem: ${res.status}`)
  return res.json()
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
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulties.length) params.set('difficulty', difficulties.join(','))
  if (tags.length) params.set('tags', tags.join(','))
  if (tags.length) params.set('tag_match', tagMatch)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  const res = await fetch(`${API_URL}/api/problems?${params.toString()}`, {
    signal,
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

export async function getProblemTags(
  signal?: AbortSignal,
): Promise<ProblemTag[]> {
  const res = await fetch(`${API_URL}/api/problems/tags`, {
    signal,
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch tags: ${res.status}`)
  return res.json()
}

export async function* streamChat(
  problemId: string,
  stage: Stage,
  activeStages: ActiveStage[],
  history: ChatMessage[],
  message: string,
  hintRequested: boolean,
  answerRequested: boolean,
  signal?: AbortSignal,
): AsyncGenerator<
  | { type: 'token'; content: string }
  | { type: 'done'; stage: Stage; message: string }
> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
  }
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      problem_id: problemId,
      stage,
      active_stages: activeStages,
      history,
      message,
      hint_requested: hintRequested,
      answer_requested: answerRequested,
    }),
    signal,
  })
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop()!
    for (const event of events) {
      const lines = event.trim().split('\n')
      const type = lines.find((l) => l.startsWith('event: '))?.slice(7)
      const data = lines.find((l) => l.startsWith('data: '))?.slice(6)
      if (!type || !data) continue
      const parsed = JSON.parse(data)
      if (type === 'token') yield { type: 'token', content: parsed.content }
      else if (type === 'done') yield { type: 'done', ...parsed }
      else if (type === 'error') throw new Error('LLM evaluation failed')
    }
  }
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
    {
      headers: await authHeaders(),
    },
  )
  if (!res.ok)
    throw new Error(`Failed to fetch smart practice problem: ${res.status}`)
  return res.json()
}

export async function getStreak(): Promise<{
  streak: number
  last_practiced_at: string | null
}> {
  const res = await fetch(`${API_URL}/api/streak`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get streak: ${res.status}`)
  return res.json()
}

export async function recordStreak(): Promise<{
  streak: number
  last_practiced_at: string | null
}> {
  const res = await fetch(`${API_URL}/api/streak`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to record streak: ${res.status}`)
  return res.json()
}

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

export async function updateSettings(
  activeStages: ActiveStage[],
  hideTitle: boolean,
  hideDifficulty: boolean,
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
      active_topics: activeTopics,
      tour_done: tourDone,
    }),
  })
  if (!res.ok) throw new Error(`Failed to update settings: ${res.status}`)
}

export async function getSavedProblems(): Promise<Problem[]> {
  const res = await fetch(`${API_URL}/api/saved`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch saved problems: ${res.status}`)
  return res.json()
}

export async function saveProblem(problemId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/saved/${problemId}`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to save problem: ${res.status}`)
}

export async function unsaveProblem(problemId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/saved/${problemId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to unsave problem: ${res.status}`)
}

export async function getProficiency(
  signal?: AbortSignal,
): Promise<TopicProficiency[]> {
  const res = await fetch(`${API_URL}/api/proficiency`, {
    headers: await authHeaders(),
    signal,
  })
  if (!res.ok) throw new Error(`Failed to fetch proficiency: ${res.status}`)
  return res.json()
}

interface ProficiencyHistoryResponse {
  history: ProficiencySnapshot[]
}

export async function getProficiencyHistory(
  signal?: AbortSignal,
): Promise<ProficiencySnapshot[]> {
  const res = await fetch(`${API_URL}/api/proficiency/history`, {
    headers: await authHeaders(),
    signal,
  })
  if (!res.ok)
    throw new Error(`Failed to fetch proficiency history: ${res.status}`)
  const data = (await res.json()) as ProficiencyHistoryResponse
  return data.history
}
