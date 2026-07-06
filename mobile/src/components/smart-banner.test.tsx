import { fireEvent, render } from '@testing-library/react-native'
import { ThemeProvider } from '../theme/theme-context'
import { SmartBanner } from './smart-banner'

test('renders the label and fires onExit', async () => {
  const onExit = jest.fn()
  const { getByTestId, getByText } = await render(
    <ThemeProvider>
      <SmartBanner onExit={onExit} />
    </ThemeProvider>,
  )
  expect(getByText('Smart Practice')).toBeTruthy()
  fireEvent.press(getByTestId('smart-exit'))
  expect(onExit).toHaveBeenCalledTimes(1)
})
