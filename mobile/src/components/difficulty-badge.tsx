import { Text } from 'react-native'
import { useTheme } from '../theme/theme-context'

const key = { Easy: 'easy', Medium: 'medium', Hard: 'hard' } as const

export function DifficultyBadge({
  difficulty,
}: {
  difficulty: 'Easy' | 'Medium' | 'Hard'
}) {
  const theme = useTheme()
  return (
    <Text style={{ color: theme[key[difficulty]], fontWeight: '600', fontSize: 13 }}>
      {difficulty}
    </Text>
  )
}
