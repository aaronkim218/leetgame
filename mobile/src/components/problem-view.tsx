import { View, Text } from 'react-native'
import type { Problem } from '../types'
import { useTheme } from '../theme/theme-context'
import { DifficultyBadge } from './difficulty-badge'
import { Markdown } from './markdown'

export function ProblemView({
  problem,
  hideTitle,
  hideDifficulty,
}: {
  problem: Problem
  hideTitle: boolean
  hideDifficulty: boolean
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderBottomColor: theme.border,
        borderBottomWidth: 1,
        padding: 16,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.foreground, fontSize: 18, fontWeight: '700', flexShrink: 1 }}>
          {hideTitle ? 'Hidden problem' : problem.title}
        </Text>
        {!hideDifficulty && <DifficultyBadge difficulty={problem.difficulty} />}
      </View>
      <Markdown content={problem.description} />
    </View>
  )
}
