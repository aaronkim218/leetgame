import { fireEvent, render } from '@testing-library/react-native'
import { ThemeProvider } from '../theme/theme-context'
import { EndOfSet } from './end-of-set'

test('renders copy and fires both callbacks', async () => {
  const onRestart = jest.fn()
  const onRandom = jest.fn()
  const { getByTestId, getByText } = await render(
    <ThemeProvider>
      <EndOfSet onRestart={onRestart} onRandom={onRandom} />
    </ThemeProvider>,
  )
  expect(getByText('End of practice set')).toBeTruthy()
  expect(
    getByText('You reached the end of the current filtered set.'),
  ).toBeTruthy()
  fireEvent.press(getByTestId('end-of-set-restart'))
  expect(onRestart).toHaveBeenCalledTimes(1)
  fireEvent.press(getByTestId('end-of-set-random'))
  expect(onRandom).toHaveBeenCalledTimes(1)
})
