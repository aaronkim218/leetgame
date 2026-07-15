import type { ProficiencySnapshot } from '../types'

export interface ChartPoint {
  ts: number
  edge_cases?: number
  brute_force?: number
  pattern?: number
  algorithm?: number
  tc_sc?: number
  overall: number
}

export function buildChartData(
  history: ProficiencySnapshot[],
  topic: string,
): ChartPoint[] {
  const topicHistory = history.filter((s) => s.topic === topic)
  const byDate = new Map<string, Partial<Record<string, number>>>()
  for (const s of topicHistory) {
    const existing = byDate.get(s.snapshot_date) ?? {}
    existing[s.stage] = Math.round(s.score * 100)
    byDate.set(s.snapshot_date, existing)
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stages]) => {
      const values = Object.values(stages) as number[]
      const overall =
        values.length > 0
          ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
          : 0
      return {
        ts: new Date(date + 'T00:00:00').getTime(),
        ...stages,
        overall,
      } as ChartPoint
    })
}
