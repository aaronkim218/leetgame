import { useEffect } from 'react'
import {
  ScrollView,
  View,
  Pressable,
  Text,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link } from 'expo-router'
import { useAuth } from '@/auth/auth-context'
import { useTheme } from '@/theme/theme-context'
import { usePracticeSession } from '@/practice/use-practice-session'
import { STAGE_PLACEHOLDER } from '@/practice/stage-banner-text'
import { ProblemView } from '@/components/problem-view'
import { StageBanner } from '@/components/stage-banner'
import { ChatThread } from '@/components/chat-thread'
import { InputBar } from '@/components/input-bar'
import { CompletionFooter } from '@/components/completion-footer'
import { NEETCODE_TOPICS, type ActiveStage } from '@/types'

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
    refreshStreak,
  } = useAuth()

  const practice = usePracticeSession({
    activeStages,
    activeTopics: NEETCODE_TOPICS,
    onComplete: () => {
      if (session) refreshStreak()
    },
  })

  useEffect(() => {
    if (authReady && !practice.problem) void practice.loadRandom()
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
        {session && streak !== null && (
          <Text
            testID="streak-indicator"
            style={{
              color:
                streakStatus === 'solid' ? theme.primary : theme.mutedForeground,
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
          onNext={() => void practice.loadRandom()}
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
