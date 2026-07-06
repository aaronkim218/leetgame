import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/auth/auth-context'
import { useTheme } from '@/theme/theme-context'
import { getProblemTags, searchProblems } from '@/api/problems'
import { useSaved } from '@/saved/use-saved'
import { setPendingPlaylist } from '@/practice/pending-playlist'
import { DifficultyBadge } from '@/components/difficulty-badge'
import {
  EMPTY_FILTERS,
  type PlaylistFilters,
  type Problem,
  type ProblemTag,
} from '@/types'

const SEARCH_PAGE_SIZE = 12
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const
const DIFFICULTY_KEY = { Easy: 'easy', Medium: 'medium', Hard: 'hard' } as const

export default function SearchScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { session } = useAuth()
  const { savedProblems, savedIds, save, unsave } = useSaved(session)

  const [q, setQ] = useState('')
  const [difficulties, setDifficulties] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagMatch, setTagMatch] = useState<'and' | 'or'>('and')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<Problem[]>([])
  const [total, setTotal] = useState(0)
  const [hasSearched, setHasSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tagQuery, setTagQuery] = useState('')
  const [showSaved, setShowSaved] = useState(false)
  const [allTags, setAllTags] = useState<ProblemTag[]>([])

  useEffect(() => {
    getProblemTags()
      .then(setAllTags)
      .catch(() => {})
  }, [])

  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(null)
      try {
        const res = await searchProblems(
          q,
          difficulties,
          tags,
          tagMatch,
          page,
          SEARCH_PAGE_SIZE,
          controller.signal,
        )
        if (controller.signal.aborted) return
        setResults(res.problems)
        setTotal(res.total)
        setHasSearched(true)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        if (!controller.signal.aborted) setError('Search failed.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, difficulties.join(','), tags.join(','), tagMatch, page])

  const startPractice = (problem?: Problem, filters?: PlaylistFilters) => {
    setPendingPlaylist({
      filters: filters ?? { q, difficulties, tags, tagMatch },
      problem,
    })
    router.dismissTo({
      pathname: '/',
      params: { playlist: String(Date.now()) },
    })
  }

  const setQuery = (v: string) => {
    setQ(v)
    setPage(1)
  }
  const toggleDifficulty = (d: string) => {
    setDifficulties((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    )
    setPage(1)
  }
  const clearDifficulties = () => {
    setDifficulties([])
    setPage(1)
  }
  const addTag = (name: string) => {
    if (!tags.includes(name)) setTags([...tags, name])
    setTagQuery('')
    setPage(1)
  }
  const removeTag = (name: string) => {
    setTags(tags.filter((t) => t !== name))
    setPage(1)
  }
  const changeTagMatch = (v: 'and' | 'or') => {
    setTagMatch(v)
    setPage(1)
  }

  const filteredTags = allTags
    .filter(
      (tag) =>
        !tags.includes(tag.name) &&
        tag.name.toLowerCase().includes(tagQuery.toLowerCase()),
    )
    .slice(0, 12)
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : (page - 1) * SEARCH_PAGE_SIZE + 1
  const showingTo = Math.min(page * SEARCH_PAGE_SIZE, total)
  const listed = showSaved ? savedProblems : results

  const chipStyle = (active: boolean, activeColor?: string) => ({
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderColor: active ? (activeColor ?? theme.foreground) : theme.border,
    backgroundColor: active && !activeColor ? theme.foreground : 'transparent',
  })
  const chipText = (active: boolean, activeColor?: string) => ({
    fontSize: 13,
    fontWeight: '500' as const,
    color: active ? (activeColor ?? theme.background) : theme.mutedForeground,
  })

  return (
    <ScrollView
      testID="search-screen"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <TextInput
        testID="search-query"
        value={q}
        onChangeText={setQuery}
        placeholder="Search by title..."
        placeholderTextColor={theme.mutedForeground}
        style={{
          color: theme.foreground,
          backgroundColor: theme.secondary,
          borderRadius: 10,
          padding: 10,
          fontSize: 14,
        }}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          testID="search-difficulty-all"
          accessibilityRole="button"
          onPress={clearDifficulties}
          style={chipStyle(difficulties.length === 0)}
        >
          <Text style={chipText(difficulties.length === 0)}>All</Text>
        </Pressable>
        {DIFFICULTIES.map((d) => {
          const active = difficulties.includes(d)
          const color = theme[DIFFICULTY_KEY[d]]
          return (
            <Pressable
              key={d}
              testID={`search-difficulty-${d}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => toggleDifficulty(d)}
              style={chipStyle(active, color)}
            >
              <Text style={chipText(active, color)}>{d}</Text>
            </Pressable>
          )
        })}
      </View>

      {session !== null && (
        <View style={{ flexDirection: 'row' }}>
          <Pressable
            testID="search-saved-toggle"
            accessibilityRole="button"
            accessibilityState={{ selected: showSaved }}
            onPress={() => setShowSaved((s) => !s)}
            style={chipStyle(showSaved)}
          >
            <Text style={chipText(showSaved)}>★ Saved</Text>
          </Pressable>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text
          style={{ color: theme.foreground, fontSize: 14, fontWeight: '500' }}
        >
          Tags
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            testID="search-tag-match-and"
            accessibilityRole="button"
            onPress={() => changeTagMatch('and')}
            style={chipStyle(tagMatch === 'and')}
          >
            <Text style={chipText(tagMatch === 'and')}>Match all</Text>
          </Pressable>
          <Pressable
            testID="search-tag-match-or"
            accessibilityRole="button"
            onPress={() => changeTagMatch('or')}
            style={chipStyle(tagMatch === 'or')}
          >
            <Text style={chipText(tagMatch === 'or')}>Match any</Text>
          </Pressable>
        </View>
        <TextInput
          testID="search-tag-query"
          value={tagQuery}
          onChangeText={setTagQuery}
          placeholder="Search available tags..."
          placeholderTextColor={theme.mutedForeground}
          style={{
            color: theme.foreground,
            backgroundColor: theme.secondary,
            borderRadius: 10,
            padding: 10,
            fontSize: 14,
          }}
        />
        {tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((tag) => (
              <Pressable
                key={tag}
                testID={`search-tag-selected-${tag}`}
                accessibilityLabel={`Remove ${tag}`}
                accessibilityRole="button"
                onPress={() => removeTag(tag)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.secondary,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ color: theme.foreground, fontSize: 12 }}>
                  {tag}
                </Text>
                <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
                  ×
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.muted,
            borderRadius: 8,
            padding: 8,
          }}
        >
          {filteredTags.length === 0 ? (
            <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
              No matching tags.
            </Text>
          ) : (
            filteredTags.map((tag) => (
              <Pressable
                key={tag.name}
                testID={`search-tag-option-${tag.name}`}
                accessibilityRole="button"
                onPress={() => addTag(tag.name)}
                style={{
                  flexDirection: 'row',
                  gap: 5,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: theme.foreground, fontSize: 13 }}>
                  {tag.name}
                </Text>
                <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
                  {tag.count}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </View>

      {!showSaved && (
        <Pressable
          testID="search-enter-playlist"
          accessibilityRole="button"
          onPress={() => startPractice()}
          style={{
            backgroundColor: theme.primary,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>
            Practice these
            {hasSearched && total > 0
              ? ` · ${total} problem${total !== 1 ? 's' : ''}`
              : ''}
          </Text>
        </Pressable>
      )}

      {showSaved && (
        <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
          {savedProblems.length} saved problem
          {savedProblems.length !== 1 ? 's' : ''}
        </Text>
      )}
      {!showSaved && error && (
        <Text
          testID="search-error"
          style={{ color: theme.destructive, fontSize: 13 }}
        >
          {error}
        </Text>
      )}
      {!showSaved && !error && hasSearched && total > 0 && (
        <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
          {loading
            ? 'Searching...'
            : `Showing ${showingFrom}-${showingTo} of ${total} · Page ${page} of ${totalPages}`}
        </Text>
      )}
      {!showSaved && loading && !hasSearched && (
        <ActivityIndicator testID="search-loading" color={theme.primary} />
      )}
      {!showSaved && !loading && !error && hasSearched && total === 0 && (
        <Text
          testID="search-empty"
          style={{ color: theme.mutedForeground, fontSize: 13 }}
        >
          No problems found.
          {difficulties.length > 0 || tags.length > 0
            ? ' Try clearing your filters.'
            : ''}
        </Text>
      )}
      {showSaved && savedProblems.length === 0 && (
        <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
          No saved problems yet.
        </Text>
      )}

      {(showSaved || (!loading && !error)) &&
        listed.map((p) => (
          <Pressable
            key={p.id}
            testID={`search-result-${p.id}`}
            accessibilityRole="button"
            onPress={() =>
              startPractice(p, showSaved ? EMPTY_FILTERS : undefined)
            }
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.muted,
              borderRadius: 8,
              padding: 14,
              gap: 8,
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              {p.leetcode_id != null && (
                <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
                  #{p.leetcode_id}
                </Text>
              )}
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: theme.foreground,
                  fontSize: 14,
                  fontWeight: '600',
                }}
              >
                {p.title}
              </Text>
              <DifficultyBadge difficulty={p.difficulty} />
              {session !== null && (
                <Pressable
                  testID={`search-save-${p.id}`}
                  accessibilityLabel={
                    savedIds.has(p.id) ? 'Remove bookmark' : 'Save for later'
                  }
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() =>
                    savedIds.has(p.id) ? void unsave(p.id) : void save(p)
                  }
                >
                  <Text style={{ color: theme.mutedForeground, fontSize: 16 }}>
                    {savedIds.has(p.id) ? '★' : '☆'}
                  </Text>
                </Pressable>
              )}
            </View>
            {p.topic_tags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                {p.topic_tags.map((tag) => (
                  <Text
                    key={tag}
                    style={{
                      color: theme.mutedForeground,
                      fontSize: 11,
                      backgroundColor: theme.secondary,
                      borderRadius: 4,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                    }}
                  >
                    {tag}
                  </Text>
                ))}
              </View>
            )}
          </Pressable>
        ))}

      {!showSaved && !error && totalPages > 1 && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 4,
          }}
        >
          <Pressable
            testID="search-prev"
            accessibilityRole="button"
            disabled={page === 1}
            onPress={() => setPage(Math.max(1, page - 1))}
            style={{
              ...chipStyle(false),
              opacity: page === 1 ? 0.5 : 1,
            }}
          >
            <Text style={chipText(false)}>Previous</Text>
          </Pressable>
          <Pressable
            testID="search-next"
            accessibilityRole="button"
            disabled={page === totalPages}
            onPress={() => setPage(Math.min(totalPages, page + 1))}
            style={{
              ...chipStyle(false),
              opacity: page === totalPages ? 0.5 : 1,
            }}
          >
            <Text style={chipText(false)}>Next</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  )
}
