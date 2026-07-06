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
  await fireEvent.press(getByTestId('end-of-set-restart'))
  expect(onRestart).toHaveBeenCalledTimes(1)
  await fireEvent.press(getByTestId('end-of-set-random'))
  expect(onRandom).toHaveBeenCalledTimes(1)
})

test('renders the error message when error is set', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      <EndOfSet
        onRestart={jest.fn()}
        onRandom={jest.fn()}
        error="Something went wrong"
      />
    </ThemeProvider>,
  )
  expect(getByTestId('end-of-set-error').props.children).toBe(
    'Something went wrong',
  )
})

test('omits the error node when error is absent', async () => {
  const { queryByTestId } = await render(
    <ThemeProvider>
      <EndOfSet onRestart={jest.fn()} onRandom={jest.fn()} />
    </ThemeProvider>,
  )
  expect(queryByTestId('end-of-set-error')).toBeNull()
})
