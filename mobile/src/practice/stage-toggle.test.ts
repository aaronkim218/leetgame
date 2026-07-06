import { toggleStage } from './stage-toggle'

test('removes an active stage', () => {
  expect(toggleStage(['pattern', 'algorithm'], 'algorithm')).toEqual([
    'pattern',
  ])
})

test('adding re-derives canonical order', () => {
  expect(toggleStage(['pattern', 'tc_sc'], 'edge_cases')).toEqual([
    'edge_cases',
    'pattern',
    'tc_sc',
  ])
})

test('refuses to remove the last active stage', () => {
  expect(toggleStage(['pattern'], 'pattern')).toEqual(['pattern'])
})
