import { fetch } from 'expo/fetch'
import type { ChatMessage, Stage, ActiveStage } from '../types'
import { API_URL, authHeaders } from './client'

export async function* streamChat(
  problemId: string,
  stage: Stage,
  activeStages: ActiveStage[],
  history: ChatMessage[],
  message: string,
  hintRequested: boolean,
  answerRequested: boolean,
  concise: boolean,
  signal?: AbortSignal,
): AsyncGenerator<
  | { type: 'token'; content: string }
  | { type: 'done'; stage: Stage; message: string }
> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      problem_id: problemId,
      stage,
      active_stages: activeStages,
      history,
      message,
      hint_requested: hintRequested,
      answer_requested: answerRequested,
      concise,
    }),
    signal,
  })
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)
  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop()!
    for (const event of events) {
      const lines = event.trim().split('\n')
      const type = lines.find((l) => l.startsWith('event: '))?.slice(7)
      const data = lines.find((l) => l.startsWith('data: '))?.slice(6)
      if (!type || !data) continue
      const parsed = JSON.parse(data)
      if (type === 'token') yield { type: 'token', content: parsed.content }
      else if (type === 'done')
        yield { type: 'done', stage: parsed.stage, message: parsed.message }
      else if (type === 'error') throw new Error('LLM evaluation failed')
    }
    if (done) break
  }
}
