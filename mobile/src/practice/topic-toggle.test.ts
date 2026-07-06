import { toggleTopic } from './topic-toggle'

test('removes an active topic', () => {
  expect(toggleTopic(['Array', 'Graph'], 'Array')).toEqual(['Graph'])
})

test('appends an inactive topic at the end (no reorder)', () => {
  expect(toggleTopic(['Graph', 'Array'], 'Tree')).toEqual([
    'Graph',
    'Array',
    'Tree',
  ])
})

test('refuses to remove the last active topic', () => {
  const topics = ['Array']
  expect(toggleTopic(topics, 'Array')).toBe(topics)
})
