import { getStageBanner } from './stage-banner-text'

test('shows base prompt when no prior stage is active', () => {
  expect(getStageBanner('pattern', ['pattern', 'tc_sc'])).toBe(
    'What pattern does this problem use?',
  )
})

test('prefixes prior-stage checkmark for algorithm after pattern', () => {
  expect(getStageBanner('algorithm', ['pattern', 'algorithm'])).toBe(
    'Pattern ✓ — Describe your algorithm',
  )
})
