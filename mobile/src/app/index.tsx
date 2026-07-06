import { useEffect, useRef } from 'react'
import {
  ScrollView,
  View,
  Pressable,
  Text,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link, useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/auth/auth-context'
import { useTheme } from '@/theme/theme-context'
import { usePracticeSession } from '@/practice/use-practice-session'
import { STAGE_PLACEHOLDER } from '@/practice/stage-banner-text'
import { ProblemView } from '@/components/problem-view'
import { StageBanner } from '@/components/stage-banner'
import { ChatThread } from '@/components/chat-thread'
import { InputBar } from '@/components/input-bar'
import { CompletionFooter } from '@/components/completion-footer'
import { SmartBanner } from '@/components/smart-banner'
import { type ActiveStage } from '@/types'

export default function PracticeScreen() {
  const theme = useTheme()
  const {
    session,
    authReady,
    streak,
    streakStatus,
    activeStages,
    hideTitle,
    hideDifficulty,
    conciseMode,
    activeTopics,
    refreshStreak,
  } = useAuth()

  const practice = usePracticeSession({
    activeStages,
    activeTopics,
    conciseMode,
    onComplete: () => {
      if (session) refreshStreak()
    },
  })

  const { smart } = useLocalSearchParams<{ smart?: string }>()
  const smartValue = Array.isArray(smart) ? smart[0] : smart
  const lastSmartRef = useRef<string | null>(null)
  useEffect(() => {
    if (authReady && smartValue && smartValue !== lastSmartRef.current) {
      lastSmartRef.current = smartValue
      void practice.loadSmart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartValue, authReady])

  useEffect(() => {
    if (authReady && !practice.problem && !smartValue)
      void practice.loadRandom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady])

  if (!authReady || !practice.problem) {
    return (
      <SafeAreaView
        testID="practice-screen"
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.background,
        }}
      >
        {practice.error ? (
          <Text
            testID="practice-error"
            style={{
              color: theme.destructive,
              padding: 24,
              textAlign: 'center',
            }}
          >
            {practice.error}
          </Text>
        ) : (
          <ActivityIndicator testID="practice-loading" color={theme.primary} />
        )}
      </SafeAreaView>
    )
  }

  const isComplete = practice.stage === 'complete'

  return (
    <SafeAreaView
      testID="practice-screen"
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Link href="/stats" asChild>
          <Pressable
            testID="stats-button"
            accessibilityLabel="Stats"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 18 }}>📊</Text>
          </Pressable>
        </Link>
        <Link href="/settings" asChild>
          <Pressable
            testID="settings-button"
            accessibilityLabel="Settings"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </Pressable>
        </Link>
        {session && streak !== null && (
          <Text
            testID="streak-indicator"
            style={{
              color:
                streakStatus === 'solid'
                  ? theme.primary
                  : theme.mutedForeground,
            }}
          >
            🔥 {streak}
          </Text>
        )}
        <Link href="/account" asChild>
          <Pressable testID="account-button">
            <Text style={{ color: theme.primary, fontWeight: '600' }}>
              {session ? 'Account' : 'Sign in'}
            </Text>
          </Pressable>
        </Link>
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {practice.problemSource === 'smart' && (
          <SmartBanner onExit={() => void practice.loadRandom()} />
        )}
        <ProblemView
          problem={practice.problem}
          hideTitle={hideTitle}
          hideDifficulty={hideDifficulty}
        />
        <StageBanner
          stage={practice.stage}
          sessionActiveStages={practice.sessionActiveStages}
        />
        <ChatThread
          history={practice.history}
          loading={practice.loading}
          streamingMessage={practice.streamingMessage}
          error={practice.error}
        />
      </ScrollView>

      {isComplete ? (
        <CompletionFooter
          onNext={() => void practice.loadNext()}
          onSmart={() => void practice.loadSmart()}
        />
      ) : (
        <InputBar
          disabled={practice.loading}
          placeholder={
            STAGE_PLACEHOLDER[practice.stage as ActiveStage] ??
            'Describe your approach…'
          }
          onSubmit={(text) => void practice.submit(text)}
          onHint={() => void practice.submit('Give me a hint', { hint: true })}
          onAnswer={() =>
            void practice.submit('Give me the answer', { answer: true })
          }
        />
      )}
    </SafeAreaView>
  )
}
