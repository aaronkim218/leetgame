import { View, Text } from 'react-native'
import type { Stage, ActiveStage } from '../types'
import { useTheme } from '../theme/theme-context'
import { getStageBanner } from '../practice/stage-banner-text'

export function StageBanner({
  stage,
  sessionActiveStages,
}: {
  stage: Stage
  sessionActiveStages: ActiveStage[]
}) {
  const theme = useTheme()
  const complete = stage === 'complete'
  return (
    <View
      style={{
        backgroundColor: complete ? 'rgba(34,197,94,0.12)' : theme.muted,
        borderBottomColor: theme.border,
        borderBottomWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          color: complete ? '#16a34a' : theme.foreground,
          fontWeight: '600',
          fontSize: 13,
        }}
      >
        {complete
          ? 'Nice work! Review your session below.'
          : getStageBanner(stage, sessionActiveStages)}
      </Text>
    </View>
  )
}
