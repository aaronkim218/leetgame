import { useCallback, useRef, useState } from 'react'
import type { Problem, ChatMessage, Stage, ActiveStage } from '../types'
import { getRandomProblem, getSmartPracticeProblem } from '../api/problems'
import { streamChat } from '../api/chat'

interface Opts {
  activeStages: ActiveStage[]
  activeTopics: string[]
  conciseMode: boolean
  onComplete: () => void
}

export function usePracticeSession({
  activeStages,
  activeTopics,
  conciseMode,
  onComplete,
}: Opts) {
  const [problem, setProblem] = useState<Problem | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [stage, setStage] = useState<Stage>(activeStages[0] ?? 'pattern')
  const [streamingMessage, setStreamingMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionStagesRef = useRef<ActiveStage[]>(activeStages)
  const abortRef = useRef<AbortController | null>(null)

  const startSession = useCallback(
    (p: Problem) => {
      abortRef.current?.abort()
      sessionStagesRef.current = activeStages
      setProblem(p)
      setHistory([])
      setStage(activeStages[0] ?? 'pattern')
      setStreamingMessage('')
      setError(null)
    },
    [activeStages],
  )

  const loadRandom = useCallback(async () => {
    setError(null)
    try {
      startSession(await getRandomProblem())
    } catch {
      setError('Failed to load a problem. Is the backend running?')
    }
  }, [startSession])

  const loadSmart = useCallback(async () => {
    setError(null)
    try {
      startSession(await getSmartPracticeProblem(activeStages, activeTopics))
    } catch {
      setError('Failed to load a problem. Is the backend running?')
    }
  }, [startSession, activeStages, activeTopics])

  const submit = useCallback(
    async (message: string, opts?: { hint?: boolean; answer?: boolean }) => {
      if (!problem) return
      const hint = opts?.hint ?? false
      const answer = opts?.answer ?? false

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError(null)
      setStreamingMessage('')

      const userMsg: ChatMessage = {
        role: 'user',
        content: message,
        marker: hint ? 'hint' : answer ? 'answer' : undefined,
      }
      const priorHistory = history
      setHistory([...priorHistory, userMsg])

      try {
        let accumulated = ''
        for await (const event of streamChat(
          problem.id,
          stage,
          sessionStagesRef.current,
          priorHistory,
          message,
          hint,
          answer,
          conciseMode,
          controller.signal,
        )) {
          if (event.type === 'token') {
            accumulated += event.content
            setStreamingMessage(accumulated)
          } else if (event.type === 'done') {
            setHistory([
              ...priorHistory,
              userMsg,
              { role: 'assistant', content: event.message },
            ])
            setStage(event.stage)
            setStreamingMessage('')
            if (event.stage === 'complete') onComplete()
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setError('Something went wrong. Please try again.')
      } finally {
        setLoading(false)
        setStreamingMessage('')
      }
    },
    [problem, history, stage, conciseMode, onComplete],
  )

  return {
    problem,
    history,
    stage,
    streamingMessage,
    loading,
    error,
    sessionActiveStages: sessionStagesRef.current,
    loadRandom,
    loadSmart,
    submit,
  }
}
