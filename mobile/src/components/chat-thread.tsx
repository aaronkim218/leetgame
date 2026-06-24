import { View, Text } from 'react-native'
import type { ChatMessage } from '../types'
import { useTheme } from '../theme/theme-context'
import { MessageBubble } from './message-bubble'

export function ChatThread({
  history,
  loading,
  streamingMessage,
  error,
}: {
  history: ChatMessage[]
  loading: boolean
  streamingMessage: string
  error: string | null
}) {
  const theme = useTheme()
  return (
    <View style={{ padding: 16, gap: 0 }}>
      {history.map((m, i) => (
        <MessageBubble key={`${i}-${m.role}`} role={m.role} content={m.content} />
      ))}
      {loading && !streamingMessage && (
        <Text style={{ color: theme.mutedForeground, fontStyle: 'italic', fontSize: 12 }}>
          Thinking…
        </Text>
      )}
      {!!streamingMessage && (
        <MessageBubble role="assistant" content={streamingMessage} />
      )}
      {!!error && (
        <Text style={{ color: theme.destructive, fontSize: 12 }}>{error}</Text>
      )}
    </View>
  )
}
