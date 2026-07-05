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
  difficulties: string[]
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
    <div
      data-tour="problem-panel"
      className={cn(
        'border-border [scrollbar-width:none] border-b [-ms-overflow-style:none] md:w-1/2 md:overflow-y-auto md:border-r md:border-b-0 [&::-webkit-scrollbar]:hidden',
        problemOpen ? 'flex-1 overflow-y-auto max-md:min-h-24' : 'shrink-0',
      )}
    >
      {/* mobile toggle bar */}
      <div className="bg-background border-border sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-2.5 md:hidden">
        <span className="text-muted-foreground flex-1 truncate text-sm font-medium">
          {titleOpen ? problem.title : 'Problem'}
        </span>
        {(!hideDifficulty || difficultyOpen) && (
          <span
            className={cn(
              'text-xs font-semibold',
              difficultyColor[problem.difficulty] ?? 'text-muted-foreground',
            )}
          >
            {problem.difficulty}
          </span>
        )}
        <button
          onClick={() => setProblemOpen((o) => !o)}
          aria-expanded={problemOpen}
          className="text-muted-foreground hover:text-foreground border-border -my-1 rounded border px-3 py-2 text-xs transition-colors"
        >
          {problemOpen ? 'Hide ▴' : 'Show ▾'}
        </button>
      </div>

      {/* content: always visible on desktop, toggled on mobile */}
      <div className={cn('p-6', !problemOpen && 'hidden md:block')}>
        {smartMode ? (
          <div className="border-border bg-muted mb-2 rounded-md border px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground mr-1 text-xs font-semibold tracking-wide uppercase">
                Smart Practice
              </span>
              {onExitPlaylist && (
                <button
                  onClick={onExitPlaylist}
                  className="text-muted-foreground hover:text-foreground ml-auto px-1 text-sm leading-none transition-colors"
                  aria-label="Exit Smart Practice"
                  title="Exit Smart Practice"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ) : playlistSummary ? (
          <div className="border-border bg-muted mb-2 rounded-md border px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground mr-1 text-xs font-semibold tracking-[0.08em] uppercase">
                Playlist
              </span>
              {playlistSummary.difficulties.map((d) => (
                <span
                  key={d}
                  className={cn(
                    'bg-background rounded-sm px-2 py-0.5 text-xs font-semibold',
                    difficultyColor[d] ?? 'text-foreground',
                  )}
                >
                  {d}
                </span>
              ))}
              {playlistSummary.q && (
                <span className="bg-background text-foreground rounded-sm px-2 py-0.5 text-xs">
                  {playlistSummary.q}
                </span>
              )}
              {playlistSummary.tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-background text-foreground rounded-sm px-2 py-0.5 text-xs"
                >
                  {tag}
                </span>
              ))}
              {onExitPlaylist && (
                <button
                  onClick={onExitPlaylist}
                  className="text-muted-foreground hover:text-foreground ml-auto px-1 text-sm leading-none transition-colors"
                  aria-label="Exit playlist"
                  title="Exit playlist"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ) : onExitPlaylist ? (
          <div className="border-border bg-muted mb-2 rounded-md border px-3.5 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground mr-1 text-xs font-semibold tracking-wide uppercase">
                Playlist
              </span>
              <button
                onClick={onExitPlaylist}
                className="text-muted-foreground hover:text-foreground ml-auto px-1 text-sm leading-none transition-colors"
                aria-label="Exit playlist"
                title="Exit playlist"
              >
                ×
              </button>
            </div>
          </div>
        ) : !onToggleShuffle ? (
          <div className="border-border bg-muted mb-4 rounded-md border px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground mr-1 text-xs font-semibold tracking-[0.08em] uppercase">
                Random
              </span>
            </div>
          </div>
        ) : null}
        {!smartMode && onSmartPractice && (
          <button
            data-tour="smart-practice-link"
            onClick={onSmartPractice}
            className="text-muted-foreground hover:text-foreground mb-3 block text-xs transition-colors"
          >
            ↗ Smart Practice
          </button>
        )}

        <div className="mb-3 flex items-start gap-2">
          <h2
            onClick={() => setTitleOpen((o) => !o)}
            className="relative m-0 flex-1 cursor-pointer select-none"
            title={titleOpen ? '' : 'Click to reveal'}
          >
            <span
              className={cn(
                'block transition-all duration-200',
                titleOpen ? 'blur-0 opacity-100' : 'opacity-0 blur-[5px]',
              )}
            >
              {problem.leetcode_id != null && (
                <span className="text-muted-foreground mr-1 font-normal">
                  #{problem.leetcode_id}
                </span>
              )}
              {problem.title}
            </span>
            {!titleOpen && (
              <span className="text-muted-foreground absolute inset-0 flex items-center text-base font-normal italic">
                Click to reveal title
              </span>
            )}
          </h2>
          {onToggleSave && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleSave()
              }}
              className="text-muted-foreground hover:text-foreground flex h-8 w-8 shrink-0 items-center justify-center text-lg leading-none transition-colors"
              title={isSaved ? 'Remove bookmark' : 'Save for later'}
              aria-label={isSaved ? 'Remove bookmark' : 'Save for later'}
            >
              {isSaved ? '★' : '☆'}
            </button>
          )}
          {onBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-muted-foreground shrink-0"
            >
              ←
            </Button>
          )}
          {onToggleShuffle && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleShuffle}
              className={cn(
                'shrink-0',
                shuffle ? 'text-primary' : 'text-muted-foreground',
              )}
              title={
                shuffle
                  ? 'Shuffle on — click to go sequential'
                  : 'Shuffle off — click to shuffle'
              }
              aria-label={shuffle ? 'Shuffle on' : 'Shuffle off'}
            >
              <Shuffle size={16} />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onSkip}
            className="text-muted-foreground shrink-0"
          >
            Next →
          </Button>
        </div>

        <div className="relative mb-3">
          <span
            onClick={() => hideDifficulty && setDifficultyOpen((o) => !o)}
            className={cn(
              'block text-xs font-semibold transition-all duration-200',
              difficultyColor[problem.difficulty] ?? 'text-muted-foreground',
              hideDifficulty && !difficultyOpen ? 'opacity-0 blur-[5px]' : '',
              hideDifficulty ? 'cursor-pointer select-none' : '',
            )}
          >
            {problem.difficulty}
          </span>
          {hideDifficulty && !difficultyOpen && (
            <span
              className="text-muted-foreground absolute inset-0 flex cursor-pointer items-center text-xs whitespace-nowrap italic select-none"
              onClick={() => setDifficultyOpen(true)}
            >
              Reveal difficulty
            </span>
          )}
        </div>

        <div className="mb-5">
          <button
            onClick={() => setTagsOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground cursor-pointer border-none bg-transparent p-0 text-xs transition-colors"
          >
            {tagsOpen ? '▾ Hide topics' : '▸ Show topics'}
          </button>
          {tagsOpen && (
            <div className="mt-2 flex flex-wrap gap-2">
              {problem.topic_tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none text-[15px] [--tw-prose-body:var(--secondary-foreground)] [--tw-prose-bold:var(--prose-bold,var(--secondary-foreground))] [--tw-prose-bullets:var(--secondary-foreground)] [--tw-prose-code:var(--secondary-foreground)] [--tw-prose-counters:var(--secondary-foreground)] [--tw-prose-headings:var(--secondary-foreground)] [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-[var(--code-bg)] [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_code::after]:content-none [&_code::before]:content-none">
          <Markdown remarkPlugins={[remarkGfm]}>{problem.description}</Markdown>
        </div>
      </div>
    </div>
  )
}
