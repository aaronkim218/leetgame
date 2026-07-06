import { Pressable, ScrollView, Text, View } from 'react-native'
import { useAuth } from '@/auth/auth-context'
import {
  useTheme,
  useThemePreference,
  type ThemePreference,
} from '@/theme/theme-context'
import { SettingRow } from '@/components/setting-row'
import { toggleStage } from '@/practice/stage-toggle'
import { CANONICAL_STAGES, type ActiveStage } from '@/types'

const STAGE_META: Record<ActiveStage, { label: string; description: string }> =
  {
    edge_cases: {
      label: 'Edge Cases',
      description: 'Identify boundary conditions and gotchas',
    },
    brute_force: {
      label: 'Brute Force',
      description: 'Describe the naive solution',
    },
    pattern: {
      label: 'Optimal Pattern',
      description: 'Identify the algorithm pattern',
    },
    algorithm: {
      label: 'Optimal Algorithm',
      description: 'Describe the optimal algorithm',
    },
    tc_sc: {
      label: 'Time & Space',
      description: 'State time and space complexity',
    },
  }

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark']

export default function SettingsScreen() {
  const theme = useTheme()
  const { preference, setPreference } = useThemePreference()
  const {
    activeStages,
    hideTitle,
    hideDifficulty,
    conciseMode,
    persistStages,
    persistHideTitle,
    persistHideDifficulty,
    persistConciseMode,
  } = useAuth()

  return (
    <ScrollView
      testID="settings-screen"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingVertical: 12 }}
    >
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: 12,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: 16,
          paddingBottom: 8,
        }}
      >
        Display
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Text
          style={{ color: theme.foreground, fontSize: 15, fontWeight: '500' }}
        >
          Theme
        </Text>
        <View
          style={{
            flexDirection: 'row',
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {THEME_OPTIONS.map((t) => (
            <Pressable
              key={t}
              testID={`settings-theme-${t}`}
              onPress={() => setPreference(t)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: preference === t ? theme.muted : 'transparent',
              }}
            >
              <Text
                style={{
                  color:
                    preference === t ? theme.foreground : theme.mutedForeground,
                  fontSize: 13,
                  fontWeight: preference === t ? '600' : '400',
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <SettingRow
        testID="settings-hide-title"
        label="Hide problem title"
        description="Reveal on click to test recall"
        checked={hideTitle}
        onPress={() => persistHideTitle(!hideTitle)}
      />
      <SettingRow
        testID="settings-hide-difficulty"
        label="Hide difficulty"
        description="Reveal on click to test recall"
        checked={hideDifficulty}
        onPress={() => persistHideDifficulty(!hideDifficulty)}
      />
      <SettingRow
        testID="settings-concise-mode"
        label="Concise mode"
        description="Less back-and-forth — brief correct answers advance the stage"
        checked={conciseMode}
        onPress={() => persistConciseMode(!conciseMode)}
      />

      <View
        style={{
          borderTopWidth: 1,
          borderColor: theme.border,
          marginHorizontal: 16,
          marginVertical: 12,
        }}
      />
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: 12,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: 16,
          paddingBottom: 8,
        }}
      >
        Practice Stages
      </Text>
      {CANONICAL_STAGES.map((stage) => {
        const active = activeStages.includes(stage)
        const isLast = active && activeStages.length === 1
        return (
          <SettingRow
            key={stage}
            testID={`settings-stage-${stage}`}
            label={STAGE_META[stage].label}
            description={STAGE_META[stage].description}
            checked={active}
            disabled={isLast}
            onPress={() => persistStages(toggleStage(activeStages, stage))}
          />
        )
      })}
    </ScrollView>
  )
}
