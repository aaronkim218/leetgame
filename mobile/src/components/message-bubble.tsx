import { View, Text } from 'react-native'
import { useTheme } from '../theme/theme-context'
import { Markdown } from './markdown'

export function MessageBubble({
  role,
  content,
}: {
  role: 'user' | 'assistant'
  content: string
}) {
  const theme = useTheme()
  const isUser = role === 'user'
  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        backgroundColor: isUser ? theme.primary : theme.secondary,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: 8,
      }}
    >
      {isUser ? (
        <Text style={{ color: theme.primaryForeground, fontSize: 14, lineHeight: 21 }}>
          {content}
        </Text>
      ) : (
        <Markdown content={content} />
      )}
    </View>
  )
}
