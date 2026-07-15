import { describe, it, expect } from 'vitest'
import type { ProficiencySnapshot } from '../types'
import { buildChartData } from './chart-data'

const snap = (
  date: string,
  stage: string,
  score: number,
  topic = 'Array',
): ProficiencySnapshot => ({ topic, stage, score, snapshot_date: date })

describe('buildChartData', () => {
  it('emits epoch-ms ts at local midnight for each snapshot date', () => {
    const points = buildChartData([snap('2026-07-10', 'pattern', 0.5)], 'Array')
    expect(points).toHaveLength(1)
    expect(points[0].ts).toBe(new Date('2026-07-10T00:00:00').getTime())
  })

  it('sorts points by ts ascending', () => {
    const points = buildChartData(
      [
        snap('2026-07-10', 'pattern', 0.5),
        snap('2026-06-01', 'pattern', 0.3),
        snap('2026-07-01', 'pattern', 0.4),
      ],
      'Array',
    )
    expect(points.map((p) => p.ts)).toEqual([
      new Date('2026-06-01T00:00:00').getTime(),
      new Date('2026-07-01T00:00:00').getTime(),
      new Date('2026-07-10T00:00:00').getTime(),
    ])
  })

  it('merges stages of the same date into one point with overall average', () => {
    const points = buildChartData(
      [
        snap('2026-07-10', 'pattern', 0.5),
        snap('2026-07-10', 'algorithm', 0.7),
      ],
      'Array',
    )
    expect(points).toHaveLength(1)
    expect(points[0].pattern).toBe(50)
    expect(points[0].algorithm).toBe(70)
    expect(points[0].overall).toBe(60)
  })

  it('ignores snapshots from other topics', () => {
    const points = buildChartData(
      [
        snap('2026-07-10', 'pattern', 0.5, 'Array'),
        snap('2026-07-11', 'pattern', 0.9, 'Graph'),
      ],
      'Array',
    )
    expect(points).toHaveLength(1)
  })
})
