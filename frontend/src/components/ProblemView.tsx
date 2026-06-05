import { useState, useRef, useEffect } from 'react'
import type { Problem } from '../types'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Shuffle } from 'lucide-react'

const difficultyColor: Record<string, string> = {
  Easy: 'text-easy',
  Medium: 'text-medium',
  Hard: 'text-hard',
}

interface SearchPlaylistSummary {
  q: string
  difficulty: string
  tags: string[]
  tagMatch: 'and' | 'or'
}

export function ProblemView({
  problem,
  onSkip,
  onBack,
  onExitPlaylist,
  playlistSummary,
  hideTitle = true,
  isSaved = false,
  onToggleSave,
  onSmartPractice,
  smartMode = false,
  shuffle,
  onToggleShuffle,
}: {
  problem: Problem
  onSkip: () => void
  onBack?: () => void
  onExitPlaylist?: () => void
  onSmartPractice?: () => void
  smartMode?: boolean
  playlistSummary?: SearchPlaylistSummary | null
  hideTitle?: boolean
  isSaved?: boolean
  onToggleSave?: () => void
  shuffle?: boolean
  onToggleShuffle?: () => void
}) {
  const [tagsOpen, setTagsOpen] = useState(false)
  const [titleOpen, setTitleOpen] = useState(!hideTitle)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitleOpen(!hideTitle)
  }, [hideTitle])
  const [problemOpen, setProblemOpen] = useState(true)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overflowOpen) return
    const handle = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [overflowOpen])

  const hasOverflow = !!(onExitPlaylist || onSmartPractice)

  return (
    <div data-tour="problem-panel" className={cn(
      "border-b md:border-b-0 md:border-r border-border md:w-1/2 md:overflow-y-auto",
      problemOpen ? "flex-1 overflow-y-auto" : "shrink-0"
    )}>
      {/* mobile toggle bar */}
      <div className="md:hidden sticky top-0 z-10 bg-background flex items-center gap-3 px-4 py-2.5 border-b border-border">
        <span className="flex-1 text-sm font-medium truncate text-muted-foreground">
          {titleOpen ? problem.title : 'Problem'}
        </span>
        <span className={cn(
          "text-xs font-semibold",
          difficultyColor[problem.difficulty] ?? 'text-muted-foreground'
        )}>
          {problem.difficulty}
        </span>
        <button
          onClick={() => setProblemOpen(o => !o)}
          aria-expanded={problemOpen}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
        >
          {problemOpen ? 'Hide ▴' : 'Show ▾'}
        </button>
      </div>

      {/* content: always visible on desktop, toggled on mobile */}
      <div className={cn("p-6", !problemOpen && "hidden md:block")}>
        {smartMode ? (
          <div className="mb-4 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mr-1">
                Smart Practice
              </span>
              <span className={cn("rounded-sm bg-background px-2 py-0.5 text-xs font-semibold", difficultyColor[problem.difficulty] ?? 'text-foreground')}>
                {problem.difficulty}
              </span>
            </div>
          </div>
        ) : playlistSummary ? (
          <div className="mb-4 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mr-1">
                Playlist
              </span>
              <span className={cn("rounded-sm bg-background px-2 py-0.5 text-xs font-semibold", difficultyColor[problem.difficulty] ?? 'text-foreground')}>
                {problem.difficulty}
              </span>
              {playlistSummary.q && (
                <span className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
                  {playlistSummary.q}
                </span>
              )}
              {playlistSummary.tags.map(tag => (
                <span key={tag} className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : !onToggleShuffle ? (
          <div className="mb-4 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mr-1">
                Random
              </span>
              <span className={cn("rounded-sm bg-background px-2 py-0.5 text-xs font-semibold", difficultyColor[problem.difficulty] ?? 'text-foreground')}>
                {problem.difficulty}
              </span>
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <span className={cn("text-xs font-semibold", difficultyColor[problem.difficulty] ?? 'text-muted-foreground')}>
              {problem.difficulty}
            </span>
          </div>
        )}

        <div className="flex items-start gap-2 mb-3">
          <h2
            onClick={() => setTitleOpen(o => !o)}
            className="m-0 flex-1 cursor-pointer select-none relative"
            title={titleOpen ? '' : 'Click to reveal'}
          >
            <span className={cn(
              "transition-all duration-200 block",
              titleOpen ? "opacity-100 blur-0" : "opacity-0 blur-[5px]"
            )}>
              {problem.leetcode_id != null && (
                <span className="text-muted-foreground font-normal mr-1">#{problem.leetcode_id}</span>
              )}
              {problem.title}
            </span>
            {!titleOpen && (
              <span className="absolute inset-0 flex items-center text-muted-foreground text-base font-normal italic">
                Click to reveal title
              </span>
            )}
          </h2>
          {onToggleSave && (
            <button
              onClick={e => { e.stopPropagation(); onToggleSave() }}
              className="shrink-0 text-lg leading-none text-muted-foreground hover:text-foreground transition-colors px-1"
              title={isSaved ? 'Remove bookmark' : 'Save for later'}
              aria-label={isSaved ? 'Remove bookmark' : 'Save for later'}
            >
              {isSaved ? '★' : '☆'}
            </button>
          )}
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 text-muted-foreground">
              ←
            </Button>
          )}
          {onToggleShuffle && (
            <button
              onClick={onToggleShuffle}
              className={cn(
                "shrink-0 p-1 rounded transition-colors",
                shuffle ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title={shuffle ? "Shuffle on — click to go sequential" : "Shuffle off — click to shuffle"}
              aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
            >
              <Shuffle size={16} />
            </button>
          )}
          <Button variant="outline" size="sm" onClick={onSkip} className="shrink-0 text-muted-foreground">
            Next →
          </Button>
          {hasOverflow && (
            <div data-tour="overflow-menu" className="relative shrink-0" ref={overflowRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOverflowOpen(o => !o)}
                className="text-muted-foreground px-2"
              >
                ···
              </Button>
              {overflowOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-md border border-border bg-background shadow-md py-1">
                  {onSmartPractice && (
                    <button
                      onClick={() => { onSmartPractice(); setOverflowOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      Smart Practice
                    </button>
                  )}
                  {onExitPlaylist && (
                    <button
                      onClick={() => { onExitPlaylist(); setOverflowOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                    >
                      {smartMode ? 'Exit Smart Practice' : 'Exit playlist'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-5">
          <button
            onClick={() => setTagsOpen(o => !o)}
            className="bg-transparent border-none cursor-pointer text-muted-foreground text-xs p-0 hover:text-foreground transition-colors"
          >
            {tagsOpen ? '▾ Hide topics' : '▸ Show topics'}
          </button>
          {tagsOpen && (
            <div className="flex gap-2 flex-wrap mt-2">
              {problem.topic_tags.map(tag => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none text-[15px] [--tw-prose-body:var(--secondary-foreground)] [--tw-prose-headings:var(--secondary-foreground)] [--tw-prose-bold:var(--prose-bold,var(--secondary-foreground))] [--tw-prose-code:var(--secondary-foreground)] [--tw-prose-bullets:var(--secondary-foreground)] [--tw-prose-counters:var(--secondary-foreground)] [&_code::before]:content-none [&_code::after]:content-none [&_:not(pre)>code]:bg-[var(--code-bg)] [&_:not(pre)>code]:rounded [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5">
          <Markdown remarkPlugins={[remarkGfm]}>{problem.description}</Markdown>
        </div>
      </div>
    </div>
  )
}
