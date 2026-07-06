import { Pressable, Text, View } from 'react-native'
import { useTheme } from '@/theme/theme-context'

interface Props {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onPress: () => void
  testID: string
}

export function SettingRow({
  label,
  description,
  checked,
  disabled,
  onPress,
  testID,
}: Props) {
  const theme = useTheme()
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: checked ? theme.primary : theme.border,
          backgroundColor: checked ? theme.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && (
          <Text style={{ color: theme.primaryForeground, fontSize: 14 }}>
            ✓
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: theme.foreground, fontSize: 15, fontWeight: '500' }}
        >
          {label}
        </Text>
        <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
          {description}
        </Text>
      </View>
    </Pressable>
  )
}
