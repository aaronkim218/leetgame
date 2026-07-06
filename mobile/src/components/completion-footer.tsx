import { View, Pressable, Text } from 'react-native'
import { useTheme } from '../theme/theme-context'

export function CompletionFooter({
  onNext,
  onSmart,
}: {
  onNext: () => void
  onSmart: () => void
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        borderTopColor: theme.border,
        borderTopWidth: 1,
        padding: 12,
      }}
    >
      <Pressable
        onPress={onNext}
        style={{
          backgroundColor: theme.primary,
          borderRadius: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>
          Next Problem
        </Text>
      </Pressable>
      <Pressable
        onPress={onSmart}
        style={{
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: theme.foreground, fontWeight: '600' }}>
          Smart Practice
        </Text>
      </Pressable>
    </View>
  )
}
