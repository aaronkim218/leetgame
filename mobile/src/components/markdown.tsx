import MarkdownDisplay from 'react-native-markdown-display'
import { useTheme } from '../theme/theme-context'

export function Markdown({ content }: { content: string }) {
  const theme = useTheme()
  return (
    <MarkdownDisplay
      style={{
        body: {
          color: theme.secondaryForeground,
          fontSize: 14,
          lineHeight: 21,
        },
        code_inline: {
          backgroundColor: theme.codeBg,
          color: theme.secondaryForeground,
          borderRadius: 4,
          paddingHorizontal: 4,
        },
        code_block: {
          backgroundColor: theme.codeBg,
          color: theme.secondaryForeground,
        },
        fence: {
          backgroundColor: theme.codeBg,
          color: theme.secondaryForeground,
        },
        bullet_list: { color: theme.secondaryForeground },
        heading1: { color: theme.secondaryForeground },
        heading2: { color: theme.secondaryForeground },
      }}
    >
      {content}
    </MarkdownDisplay>
  )
}
