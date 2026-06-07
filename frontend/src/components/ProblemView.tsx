import { useState, useEffect } from 'react'
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
  hideDifficulty = false,
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
  hideDifficulty?: boolean
}) {
  const [tagsOpen, setTagsOpen] = useState(false)
  const [titleOpen, setTitleOpen] = useState(!hideTitle)
  const [difficultyOpen, setDifficultyOpen] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitleOpen(!hideTitle)
  }, [hideTitle])
  const [problemOpen, setProblemOpen] = useState(true)

  return (
    <div data-tour="problem-panel" className={cn(
      "border-b md:border-b-0 md:border-r border-border md:w-1/2 md:overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
      problemOpen ? "flex-1 overflow-y-auto" : "shrink-0"
    )}>
      {/* mobile toggle bar */}
      <div className="md:hidden sticky top-0 z-10 bg-background flex items-center gap-3 px-4 py-2.5 border-b border-border">
        <span className="flex-1 text-sm font-medium truncate text-muted-foreground">
          {titleOpen ? problem.title : 'Problem'}
        </span>
        {(!hideDifficulty || difficultyOpen) && (
          <span className={cn(
            "text-xs font-semibold",
            difficultyColor[problem.difficulty] ?? 'text-muted-foreground'
          )}>
            {problem.difficulty}
          </span>
        )}
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
          <div className="mb-2 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-1">
                Smart Practice
              </span>
              {onExitPlaylist && (
                <button
                  onClick={onExitPlaylist}
                  className="ml-auto text-muted-foreground hover:text-foreground transition-colors text-sm leading-none px-1"
                  aria-label="Exit Smart Practice"
                  title="Exit Smart Practice"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ) : playlistSummary ? (
          <div className="mb-2 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mr-1">
                Playlist
              </span>
              {playlistSummary.difficulty && (
                <span className={cn("rounded-sm bg-background px-2 py-0.5 text-xs font-semibold", difficultyColor[playlistSummary.difficulty] ?? 'text-foreground')}>
                  {playlistSummary.difficulty}
                </span>
              )}
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
              {onExitPlaylist && (
                <button
                  onClick={onExitPlaylist}
                  className="ml-auto text-muted-foreground hover:text-foreground transition-colors text-sm leading-none px-1"
                  aria-label="Exit playlist"
                  title="Exit playlist"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ) : onExitPlaylist ? (
          <div className="mb-2 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-1">
                Playlist
              </span>
              <button
                onClick={onExitPlaylist}
                className="ml-auto text-muted-foreground hover:text-foreground transition-colors text-sm leading-none px-1"
                aria-label="Exit playlist"
                title="Exit playlist"
              >
                ×
              </button>
            </div>
          </div>
        ) : !onToggleShuffle ? (
          <div className="mb-4 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mr-1">
                Random
              </span>
            </div>
          </div>
        ) : null}
        {!smartMode && onSmartPractice && (
          <button
            data-tour="smart-practice-link"
            onClick={onSmartPractice}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 block"
          >
            ↗ Smart Practice
          </button>
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
                shuffle ? "text-primary" : "text-muted-foreground hover:text-foreground"
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
        </div>

        <div className="relative mb-3">
          <span
            onClick={() => hideDifficulty && setDifficultyOpen(o => !o)}
            className={cn(
              "text-xs font-semibold transition-all duration-200 block",
              difficultyColor[problem.difficulty] ?? 'text-muted-foreground',
              hideDifficulty && !difficultyOpen ? "opacity-0 blur-[5px]" : "",
              hideDifficulty ? "cursor-pointer select-none" : ""
            )}
          >
            {problem.difficulty}
          </span>
          {hideDifficulty && !difficultyOpen && (
            <span
              className="absolute inset-0 flex items-center text-muted-foreground text-xs italic cursor-pointer select-none whitespace-nowrap"
              onClick={() => setDifficultyOpen(true)}
            >
              Reveal difficulty
            </span>
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
