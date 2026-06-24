import { render } from '@testing-library/react-native'
import { ThemeProvider } from '../theme/theme-context'
import { MessageBubble } from './message-bubble'

test('renders user content as plain text', async () => {
  const { getByText } = await render(
    <ThemeProvider>
      <MessageBubble role="user" content="my answer" />
    </ThemeProvider>,
  )
  expect(getByText('my answer')).toBeTruthy()
})

test('renders assistant content', async () => {
  const { getByText } = await render(
    <ThemeProvider>
      <MessageBubble role="assistant" content="feedback here" />
    </ThemeProvider>,
  )
  expect(getByText('feedback here')).toBeTruthy()
})
