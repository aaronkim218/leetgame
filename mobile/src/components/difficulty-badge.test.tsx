import { render } from '@testing-library/react-native'
import { ThemeProvider } from '../theme/theme-context'
import { DifficultyBadge } from './difficulty-badge'

test('renders the difficulty label', async () => {
  const { getByText } = await render(
    <ThemeProvider>
      <DifficultyBadge difficulty="Medium" />
    </ThemeProvider>,
  )
  expect(getByText('Medium')).toBeTruthy()
})
