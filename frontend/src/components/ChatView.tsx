import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, Stage, ActiveStage } from '../types'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function MarkdownMessage({
  content,
  cursor = false,
}: {
  content: string
  cursor?: boolean
}) {
  return (
    <div className="prose prose-sm max-w-none [--tw-prose-body:var(--secondary-foreground)] [--tw-prose-bold:var(--prose-bold,var(--secondary-foreground))] [--tw-prose-bullets:var(--secondary-foreground)] [--tw-prose-code:var(--secondary-foreground)] [--tw-prose-counters:var(--secondary-foreground)] [--tw-prose-headings:var(--secondary-foreground)] [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-[var(--code-bg)] [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_code::after]:content-none [&_code::before]:content-none">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      {cursor && <span className="ml-0.5 animate-pulse">▌</span>}
    </div>
  )
}

const stageBannerBase: Record<ActiveStage, string> = {
  edge_cases: 'What edge cases does this problem have?',
  brute_force: 'What is the brute force approach?',
  pattern: 'What pattern does this problem use?',
  algorithm: 'Describe your algorithm',
  tc_sc: 'Describe the time and space complexity',
}

const stagePrev: Partial<Record<ActiveStage, ActiveStage>> = {
  algorithm: 'pattern',
  tc_sc: 'algorithm',
}

const stageLabel: Partial<Record<ActiveStage, string>> = {
  pattern: 'Pattern',
  algorithm: 'Algorithm',
}

function getStageBanner(
  stage: ActiveStage,
  sessionActiveStages: ActiveStage[],
): string {
  const prev = stagePrev[stage]
  if (prev && sessionActiveStages.includes(prev)) {
    return `${stageLabel[prev]} ✓ — ${stageBannerBase[stage]}`
  }
  return stageBannerBase[stage]
}

const stagePlaceholder: Record<ActiveStage, string> = {
  edge_cases: 'e.g. empty input, single element, negative numbers, overflow…',
  brute_force: 'Describe the naive solution…',
  pattern: 'e.g. sliding window, BFS/DFS, dynamic programming…',
  algorithm: 'Describe your algorithm…',
  tc_sc: 'State your time and space complexity…',
}

interface Props {
  history: ChatMessage[]
  stage: Stage
  sessionActiveStages: ActiveStage[]
  loading: boolean
  error: string | null
  onSubmit: (message: string) => void
  streamingMessage: string
  onNext?: () => void
  onSmartPractice?: () => void
  onBack?: () => void
  onHint?: () => void
  onAnswer?: () => void
}

export function ChatView({
  history,
  stage,
  sessionActiveStages,
  loading,
  error,
  onSubmit,
  streamingMessage,
  onNext,
  onSmartPractice,
  onBack,
  onHint,
  onAnswer,
}: Props) {
  const [input, setInput] = useState('')
  const [queue, setQueue] = useState<string[]>([])
  const [chatOpen, setChatOpen] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  useEffect(() => {
    if (streamingMessage) {
      bottomRef.current?.scrollIntoView({
        behavior: 'instant' as ScrollBehavior,
      })
    }
  }, [streamingMessage])

  useEffect(() => {
    if (!loading) textareaRef.current?.focus()
  }, [loading])

  useEffect(() => {
    if (!loading && queue.length > 0) {
      const [next, ...rest] = queue
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQueue(rest)
      onSubmit(next)
    }
  }, [loading, queue, onSubmit])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setInput('')
    if (loading) {
      setQueue((q) => [...q, trimmed])
    } else {
      onSubmit(trimmed)
    }
  }

  return (
    <div
      data-tour="chat-panel"
      className="flex min-h-0 flex-col max-md:flex-[0_1_auto] md:w-1/2 md:flex-1"
    >
      <div
        className={cn(
          'border-border flex shrink-0 items-center gap-3 border-b px-5 py-3 text-sm font-semibold',
          stage === 'complete'
            ? 'bg-green-500/10 text-green-700 dark:text-green-400'
            : 'bg-muted text-foreground',
        )}
      >
        <span className="flex-1">
          {stage === 'complete'
            ? 'Nice work! Review your session below.'
            : getStageBanner(stage as ActiveStage, sessionActiveStages)}
        </span>
        <button
          onClick={() => setChatOpen((o) => !o)}
          aria-expanded={chatOpen}
          className="text-muted-foreground hover:text-foreground border-border -my-1 rounded border px-3 py-2 text-xs font-normal transition-colors md:hidden"
        >
          {chatOpen ? 'Hide ▾' : 'Show ▴'}
        </button>
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-col gap-3 overflow-y-auto p-5 max-md:max-h-[45dvh] max-md:flex-[0_1_auto] md:flex-1',
          !chatOpen && 'max-md:hidden',
        )}
      >
        {history.map((msg, i) => (
          <div
            key={`${i}-${msg.role}`}
            className={cn(
              'max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground self-end whitespace-pre-wrap'
                : 'bg-secondary text-secondary-foreground self-start',
            )}
          >
            {msg.role === 'user' ? (
              msg.content
            ) : (
              <MarkdownMessage content={msg.content} />
            )}
          </div>
        ))}
        {loading && !streamingMessage && (
          <div className="text-muted-foreground self-start text-xs italic">
            Thinking...
          </div>
        )}
        {streamingMessage && (
          <div className="bg-secondary text-secondary-foreground max-w-[80%] self-start rounded-xl px-3.5 py-2.5 text-sm leading-relaxed">
            <MarkdownMessage content={streamingMessage} cursor />
          </div>
        )}
        {error && (
          <div className="text-destructive self-start text-xs">{error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {stage === 'complete' ? (
        <div
          className={cn(
            'border-border flex shrink-0 items-center gap-2 border-t p-4',
            !chatOpen && 'max-md:hidden',
          )}
        >
          {onBack && (
            <Button variant="ghost" onClick={onBack}>
              ← Back
            </Button>
          )}
          {onNext && (
            <Button onClick={onNext} className="ml-auto">
              Next Problem
            </Button>
          )}
          {onSmartPractice && (
            <Button variant="outline" onClick={onSmartPractice}>
              Smart Practice
            </Button>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className={cn(
            'border-border flex shrink-0 flex-col gap-2 border-t p-4',
            !chatOpen && 'max-md:hidden',
          )}
        >
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder={
                  stagePlaceholder[stage as ActiveStage] ??
                  'Describe your approach…'
                }
                rows={3}
                className="resize-none font-sans"
              />
              {queue.length > 0 && (
                <div className="flex flex-col gap-1 px-1">
                  {queue.map((msg, i) => (
                    <div
                      key={i}
                      className="text-muted-foreground flex items-start gap-1.5 text-xs"
                    >
                      <span className="mt-0.5 shrink-0 opacity-50">
                        {i + 1}.
                      </span>
                      <span className="flex-1 truncate">{msg}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setQueue((q) => q.filter((_, j) => j !== i))
                        }
                        className="hover:text-destructive shrink-0 opacity-50 transition-opacity hover:opacity-100"
                        aria-label="Cancel queued message"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button type="submit" disabled={!input.trim()}>
              Send
            </Button>
          </div>
          {(onHint || onAnswer) && (
            <div className="flex gap-2">
              {onHint && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onHint}
                  disabled={loading}
                >
                  Give me a hint
                </Button>
              )}
              {onAnswer && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAnswer}
                  disabled={loading}
                >
                  Give me the answer
                </Button>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  )
}
