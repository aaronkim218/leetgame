import { setPendingPlaylist, takePendingPlaylist } from './pending-playlist'

const filters = {
  q: 'x',
  difficulties: [],
  tags: [],
  tagMatch: 'and' as const,
}

test('take returns what was set, then null (one-shot)', () => {
  setPendingPlaylist({ filters })
  expect(takePendingPlaylist()).toEqual({ filters })
  expect(takePendingPlaylist()).toBeNull()
})

test('take returns null when nothing was set', () => {
  expect(takePendingPlaylist()).toBeNull()
})
