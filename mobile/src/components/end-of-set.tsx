import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/theme-context'

export function EndOfSet({
  onRestart,
  onRandom,
}: {
  onRestart: () => void
  onRandom: () => void
}) {
  const theme = useTheme()
  return (
    <View
      testID="end-of-set"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
      }}
    >
      <Text
        style={{ color: theme.foreground, fontSize: 22, fontWeight: '600' }}
      >
        End of practice set
      </Text>
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: 14,
          textAlign: 'center',
        }}
      >
        You reached the end of the current filtered set.
      </Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          testID="end-of-set-restart"
          accessibilityRole="button"
          onPress={onRestart}
          style={{
            backgroundColor: theme.primary,
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>
            Restart set
          </Text>
        </Pressable>
        <Pressable
          testID="end-of-set-random"
          accessibilityRole="button"
          onPress={onRandom}
          style={{
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: theme.foreground, fontWeight: '600' }}>
            Random problem
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
