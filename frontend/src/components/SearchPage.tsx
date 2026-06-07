import { useState, useEffect } from 'react'
import type { Problem, ProblemTag, SearchState } from '../types'
import { SEARCH_PAGE_SIZE } from '../hooks/useSearch'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Skeleton } from './ui/skeleton'

const difficulties = ['Easy', 'Medium', 'Hard'] as const
type Difficulty = typeof difficulties[number]

const difficultyTextClass: Record<Difficulty, string> = {
  Easy: 'text-easy',
  Medium: 'text-medium',
  Hard: 'text-hard',
}

const difficultyActiveClass: Record<Difficulty, string> = {
  Easy: 'border-easy text-easy bg-easy/10',
  Medium: 'border-medium text-medium bg-medium/10',
  Hard: 'border-hard text-hard bg-hard/10',
}

const tagMatchModes = [
  { value: 'and', label: 'Match all' },
  { value: 'or', label: 'Match any' },
] as const

function SearchResultSkeleton() {
  return (
    <div className="p-4 rounded-md border border-border bg-muted mb-2">
      <div className="flex items-center gap-2.5 mb-1.5">
        <Skeleton className="h-3.5 w-8 rounded-sm" />
        <Skeleton className="h-3.5 w-48 rounded-sm" />
        <Skeleton className="h-3.5 w-12 rounded-sm" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-16 rounded-sm" />
        <Skeleton className="h-5 w-20 rounded-sm" />
        <Skeleton className="h-5 w-14 rounded-sm" />
      </div>
    </div>
  )
}

export interface SearchSelectionContext {
  q: string
  difficulty: string
  tags: string[]
  tagMatch: 'and' | 'or'
  page: number
  pageSize: number
  results: Problem[]
  selectedIndex: number
}

interface Props {
  onSelectProblem: (p: Problem, context: SearchSelectionContext) => void
  onEnterPlaylist?: () => void
  searchState: SearchState
  onSearchStateChange: (s: SearchState) => void
  loading: boolean
  error: string | null
  availableTags: ProblemTag[]
  tagsLoading: boolean
  tagsError: string | null
  savedIds: Set<string>
  savedProblems: Problem[]
  onToggleSave: (problem: Problem) => void
  showSave: boolean
}

export function SearchPage({ onSelectProblem, onEnterPlaylist, searchState, onSearchStateChange, loading, error, availableTags, tagsLoading, tagsError, savedIds, savedProblems, onToggleSave, showSave }: Props) {
  const [tagQuery, setTagQuery] = useState('')
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!showSave) setShowSaved(false)
  }, [showSave])

  const { q, difficulty, tags, tagMatch, results, page, total, hasSearched } = searchState
  const hasActiveFilters = q !== '' || difficulty !== '' || tags.length > 0

  const setQ = (v: string) => onSearchStateChange({ ...searchState, q: v, page: 1 })
  const setDifficulty = (v: string) => onSearchStateChange({ ...searchState, difficulty: v, page: 1 })
  const setTags = (v: string[]) => onSearchStateChange({ ...searchState, tags: v, page: 1 })
  const setTagMatch = (v: 'and' | 'or') => onSearchStateChange({ ...searchState, tagMatch: v, page: 1 })
  const setPage = (v: number) => onSearchStateChange({ ...searchState, page: v })

  const addTag = (tag: string) => {
    if (!tags.includes(tag)) setTags([...tags, tag])
    setTagQuery('')
  }

  const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag))
  const filteredTags = availableTags.filter(tag => (
    !tags.includes(tag.name) &&
    tag.name.toLowerCase().includes(tagQuery.toLowerCase())
  )).slice(0, 12)
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : (page - 1) * SEARCH_PAGE_SIZE + 1
  const showingTo = Math.min(page * SEARCH_PAGE_SIZE, total)

  const skeletonList = (
    <div>
      {Array.from({ length: 8 }).map((_, i) => (
        <SearchResultSkeleton key={i} />
      ))}
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto"><div className="max-w-2xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold mb-6">Search Problems</h2>

      <Input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search by title..."
        className="mb-4 bg-muted"
      />

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setDifficulty('')}
          className={cn(
            'px-3.5 py-1.5 text-sm rounded-md border cursor-pointer transition-colors',
            difficulty === ''
              ? 'border-foreground bg-foreground text-background'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          All
        </button>
        {difficulties.map(d => (
          <button
            key={d}
            onClick={() => setDifficulty(difficulty === d ? '' : d)}
            className={cn(
              'px-3.5 py-1.5 text-sm rounded-md border cursor-pointer transition-colors',
              difficulty === d
                ? difficultyActiveClass[d]
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {d}
          </button>
        ))}
      </div>

      {showSave && (
        <div className="mb-4">
          <button
            onClick={() => setShowSaved(s => !s)}
            className={cn(
              'px-3.5 py-1.5 text-sm rounded-md border cursor-pointer transition-colors',
              showSaved
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            ★ Saved
          </button>
        </div>
      )}

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Tags</p>
          {tags.length > 0 && (
            <button
              type="button"
              onClick={() => setTags([])}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="mb-3 flex gap-2">
          {tagMatchModes.map(mode => (
            <button
              key={mode.value}
              type="button"
              onClick={() => setTagMatch(mode.value)}
              className={cn(
                'px-3.5 py-1.5 text-sm rounded-md border cursor-pointer transition-colors',
                tagMatch === mode.value
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <Input
          value={tagQuery}
          onChange={e => setTagQuery(e.target.value)}
          placeholder="Search available tags..."
          className="mb-2 bg-muted"
        />
        {tags.length > 0 && (
          <div className="mb-3 flex gap-1.5 flex-wrap">
            {tags.map(tag => (
              <span key={tag} className="flex items-center gap-1.5 bg-secondary text-secondary-foreground border border-border rounded-sm px-2 py-0.5 text-xs">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`} className="cursor-pointer text-muted-foreground hover:text-foreground leading-none bg-transparent border-none p-0">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="rounded-md border border-border bg-muted p-2">
          {tagsLoading && <p className="px-2 py-1 text-sm text-muted-foreground">Loading tags...</p>}
          {tagsError && <p className="px-2 py-1 text-sm text-destructive">{tagsError}</p>}
          {!tagsLoading && !tagsError && filteredTags.length === 0 && (
            <p className="px-2 py-1 text-sm text-muted-foreground">No matching tags.</p>
          )}
          {!tagsLoading && !tagsError && filteredTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {filteredTags.map(tag => (
                <button
                  key={tag.name}
                  type="button"
                  onClick={() => addTag(tag.name)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary"
                >
                  {tag.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">{tag.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {onEnterPlaylist && hasActiveFilters && !showSaved && (
        <div className="mb-6">
          <Button
            onClick={onEnterPlaylist}
            className="w-full"
          >
            Enter Playlist
            {hasSearched && total > 0 && (
              <span className="ml-2 opacity-70 font-normal">· {total} problem{total !== 1 ? 's' : ''}</span>
            )}
          </Button>
        </div>
      )}

      {error && !showSaved && <p className="text-sm text-destructive">{error}</p>}
      {!showSaved && !error && hasSearched && total > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>{loading ? 'Searching...' : `Showing ${showingFrom}-${showingTo} of ${total}`}</p>
          <p>Page {page} of {totalPages}</p>
        </div>
      )}
      {showSaved && (
        <p className="mb-3 text-sm text-muted-foreground">
          {savedProblems.length} saved problem{savedProblems.length !== 1 ? 's' : ''}
        </p>
      )}
      {!showSaved && loading && skeletonList}
      {!showSaved && !loading && !error && hasSearched && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No problems found.</p>
      )}
      {showSaved && savedProblems.length === 0 && (
        <p className="text-sm text-muted-foreground">No saved problems yet.</p>
      )}
      {(showSaved ? savedProblems : (!error && !loading ? results : [])).map(p => (
        <div
          key={p.id}
          onClick={() => onSelectProblem(p, {
            q: showSaved ? '' : q,
            difficulty: showSaved ? '' : difficulty,
            tags: showSaved ? [] : tags,
            tagMatch: showSaved ? 'and' : tagMatch,
            page: showSaved ? 1 : page,
            pageSize: SEARCH_PAGE_SIZE,
            results: showSaved ? savedProblems : results,
            selectedIndex: (showSaved ? savedProblems : results).findIndex(r => r.id === p.id),
          })}
          className="p-4 rounded-md border border-border bg-muted hover:bg-secondary cursor-pointer mb-2 transition-colors"
        >
          <div className="flex items-center gap-2.5 mb-1.5">
            {p.leetcode_id != null && (
              <span className="text-xs text-muted-foreground font-normal">#{p.leetcode_id}</span>
            )}
            <span className="font-semibold text-sm flex-1">{p.title}</span>
            <span className={cn('text-xs font-semibold', difficultyTextClass[p.difficulty as Difficulty])}>
              {p.difficulty}
            </span>
            {showSave && (
              <button
                onClick={e => { e.stopPropagation(); onToggleSave(p) }}
                className="text-base leading-none text-muted-foreground hover:text-foreground transition-colors ml-1"
                title={savedIds.has(p.id) ? 'Remove bookmark' : 'Save for later'}
                aria-label={savedIds.has(p.id) ? 'Remove bookmark' : 'Save for later'}
              >
                {savedIds.has(p.id) ? '★' : '☆'}
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {p.topic_tags.map(tag => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
          </div>
        </div>
      ))}
      {!showSaved && !error && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div></div>
  )
}
