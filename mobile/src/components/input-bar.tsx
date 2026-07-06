import { useState } from 'react'
import { View, TextInput, Pressable, Text } from 'react-native'
import { useTheme } from '../theme/theme-context'

export function InputBar({
  disabled,
  onSubmit,
  onHint,
  onAnswer,
  placeholder,
}: {
  disabled: boolean
  onSubmit: (text: string) => void
  onHint: () => void
  onAnswer: () => void
  placeholder: string
}) {
  const theme = useTheme()
  const [text, setText] = useState('')

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    setText('')
    onSubmit(trimmed)
  }

  return (
    <View
      style={{
        borderTopColor: theme.border,
        borderTopWidth: 1,
        padding: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={theme.mutedForeground}
          multiline
          editable={!disabled}
          style={{
            flex: 1,
            minHeight: 64,
            color: theme.foreground,
            backgroundColor: theme.secondary,
            borderRadius: 10,
            padding: 10,
            fontSize: 14,
          }}
        />
        <Pressable
          onPress={send}
          disabled={disabled || !text.trim()}
          style={{
            backgroundColor: theme.primary,
            opacity: disabled || !text.trim() ? 0.5 : 1,
            borderRadius: 10,
            paddingHorizontal: 16,
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>
            Send
          </Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={onHint}
          disabled={disabled}
          style={{ opacity: disabled ? 0.5 : 1 }}
        >
          <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
            Give me a hint
          </Text>
        </Pressable>
        <Pressable
          onPress={onAnswer}
          disabled={disabled}
          style={{ opacity: disabled ? 0.5 : 1 }}
        >
          <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
            Give me the answer
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
