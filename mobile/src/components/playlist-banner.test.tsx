import { fireEvent, render } from '@testing-library/react-native'
import { ThemeProvider } from '../theme/theme-context'
import { PlaylistBanner, playlistSummary } from './playlist-banner'

test('playlistSummary formats query, difficulties, and tags', () => {
  expect(
    playlistSummary({
      q: 'two sum',
      difficulties: ['Easy', 'Medium'],
      tags: ['Array', 'Graph'],
      tagMatch: 'and',
    }),
  ).toBe('"two sum" · Easy/Medium · Array+Graph')
  expect(
    playlistSummary({
      q: '',
      difficulties: [],
      tags: ['Array', 'Graph'],
      tagMatch: 'or',
    }),
  ).toBe('Array, Graph')
  expect(
    playlistSummary({ q: '', difficulties: [], tags: [], tagMatch: 'and' }),
  ).toBe('Playlist')
})

test('renders the summary and fires onExit', async () => {
  const onExit = jest.fn()
  const { getByTestId, getByText } = await render(
    <ThemeProvider>
      <PlaylistBanner
        filters={{
          q: 'sum',
          difficulties: [],
          tags: [],
          tagMatch: 'and',
        }}
        onExit={onExit}
      />
    </ThemeProvider>,
  )
  expect(getByText('"sum"')).toBeTruthy()
  fireEvent.press(getByTestId('playlist-exit'))
  expect(onExit).toHaveBeenCalledTimes(1)
})
