import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/auth/auth-context'
import { useTheme } from '@/theme/theme-context'
import { getProficiency } from '@/api/proficiency'
import { getProblemTags } from '@/api/problems'
import { toggleTopic } from '@/practice/topic-toggle'
import type { ProblemTag, TopicProficiency } from '@/types'

const STAGE_LABEL: Record<string, string> = {
  edge_cases: 'Edge Cases',
  brute_force: 'Brute Force',
  pattern: 'Pattern',
  algorithm: 'Algorithm',
  tc_sc: 'Time & Space',
}

function barColor(score: number): string {
  if (score >= 0.7) return '#22c55e'
  if (score >= 0.4) return '#eab308'
  return '#ef4444'
}

export default function StatsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { session, activeTopics, persistTopics } = useAuth()
  const [proficiencies, setProficiencies] = useState<TopicProficiency[]>([])
  const [allTags, setAllTags] = useState<ProblemTag[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const signedIn = session !== null

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    Promise.all([getProficiency(), getProblemTags()])
      .then(([prof, tags]) => {
        if (cancelled) return
        setProficiencies(prof)
        setAllTags(tags)
        setFetchError(false)
      })
      .catch(() => {
        if (!cancelled) setFetchError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [signedIn])

  if (!signedIn) {
    return (
      <View
        testID="stats-screen"
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 12,
        }}
      >
        <Text style={{ color: theme.mutedForeground, textAlign: 'center' }}>
          Sign in to track proficiency
        </Text>
        <Pressable
          testID="stats-sign-in"
          accessibilityLabel="Sign in"
          accessibilityRole="button"
          onPress={() => router.push('/sign-in')}
          style={{
            backgroundColor: theme.primary,
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>
            Sign in
          </Text>
        </Pressable>
      </View>
    )
  }

  if (loading) {
    return (
      <View
        testID="stats-screen"
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator testID="stats-loading" color={theme.primary} />
      </View>
    )
  }

  if (fetchError) {
    return (
      <View
        testID="stats-screen"
        style={{ flex: 1, backgroundColor: theme.background, padding: 24 }}
      >
        <Text
          testID="stats-error"
          style={{ color: theme.mutedForeground, fontSize: 13 }}
        >
          Failed to load stats.
        </Text>
      </View>
    )
  }

  const activeSet = new Set(activeTopics)
  const filtered = proficiencies.filter((p) => activeSet.has(p.topic))
  const topicMap = new Map<string, TopicProficiency[]>()
  for (const p of filtered) {
    topicMap.set(p.topic, [...(topicMap.get(p.topic) ?? []), p])
  }
  const topics = Array.from(topicMap.entries())
    .map(([topic, rows]) => ({
      topic,
      rows,
      avg: rows.reduce((sum, r) => sum + r.score, 0) / rows.length,
    }))
    .sort((a, b) => a.avg - b.avg)

  const topicPicker = (
    <View style={{ marginBottom: 16 }}>
      <Pressable
        testID="stats-manage-topics"
        accessibilityRole="button"
        accessibilityState={{ expanded: pickerOpen }}
        onPress={() => setPickerOpen((o) => !o)}
      >
        <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
          {pickerOpen ? '▾' : '▸'} Manage topics ({activeTopics.length} of{' '}
          {allTags.length} active)
        </Text>
      </Pressable>
      {pickerOpen && (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 12,
          }}
        >
          {allTags.map((tag) => {
            const active = activeSet.has(tag.name)
            const isLast = active && activeTopics.length === 1
            return (
              <Pressable
                key={tag.name}
                testID={`stats-topic-chip-${tag.name}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: isLast }}
                disabled={isLast}
                onPress={() =>
                  persistTopics(toggleTopic(activeTopics, tag.name))
                }
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderColor: active ? theme.foreground : theme.border,
                  backgroundColor: active ? theme.foreground : 'transparent',
                  opacity: isLast ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '500',
                    color: active ? theme.background : theme.mutedForeground,
                  }}
                >
                  {tag.name}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )

  return (
    <ScrollView
      testID="stats-screen"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <Text
          style={{ color: theme.foreground, fontSize: 18, fontWeight: '600' }}
        >
          Topic Proficiency
        </Text>
        <Pressable
          testID="stats-smart-practice"
          accessibilityLabel="Practice Weakest Topics"
          accessibilityRole="button"
          onPress={() =>
            router.dismissTo({
              pathname: '/',
              params: { smart: String(Date.now()) },
            })
          }
          style={{
            backgroundColor: theme.primary,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              color: theme.primaryForeground,
              fontSize: 12,
              fontWeight: '600',
            }}
          >
            Practice Weakest Topics
          </Text>
        </Pressable>
      </View>
      {topicPicker}
      {topics.length === 0 ? (
        <Text
          testID="stats-empty"
          style={{ color: theme.mutedForeground, fontSize: 13 }}
        >
          Complete a practice session to see your scores.
        </Text>
      ) : (
        topics.map(({ topic, rows }) => (
          <View
            key={topic}
            testID={`stats-topic-card-${topic}`}
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.muted,
              borderRadius: 8,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: theme.foreground,
                fontSize: 14,
                fontWeight: '600',
                marginBottom: 10,
              }}
            >
              {topic}
            </Text>
            {rows.map((row) => (
              <View
                key={row.stage}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <Text
                  style={{
                    color: theme.mutedForeground,
                    fontSize: 12,
                    width: 88,
                  }}
                >
                  {STAGE_LABEL[row.stage] ?? row.stage}
                </Text>
                <View
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: theme.border,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      borderRadius: 999,
                      width: `${Math.round(row.score * 100)}%`,
                      backgroundColor: barColor(row.score),
                    }}
                  />
                </View>
                <Text
                  style={{
                    color: theme.mutedForeground,
                    fontSize: 12,
                    width: 34,
                    textAlign: 'right',
                  }}
                >
                  {Math.round(row.score * 100)}%
                </Text>
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  )
}
