import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/theme-context'

export function SmartBanner({ onExit }: { onExit: () => void }) {
  const theme = useTheme()
  return (
    <View
      testID="smart-banner"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: 12,
        marginTop: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 8,
        backgroundColor: theme.muted,
      }}
    >
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: 12,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        Smart Practice
      </Text>
      <Pressable
        testID="smart-exit"
        accessibilityLabel="Exit Smart Practice"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onExit}
      >
        <Text style={{ color: theme.mutedForeground, fontSize: 16 }}>×</Text>
      </Pressable>
    </View>
  )
}
