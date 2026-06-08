import { useEffect, useState } from 'react'
import type { TopicProficiency, ProblemTag, ProficiencySnapshot } from '../types'
import { getProficiency, getProblemTags, getProficiencyHistory } from '../api'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart'
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'

const STAGES = ['edge_cases', 'brute_force', 'pattern', 'algorithm', 'tc_sc'] as const

const chartConfig = {
  edge_cases:  { label: 'Edge Cases',   color: '#a78bfa' },
  brute_force: { label: 'Brute Force',  color: '#60a5fa' },
  pattern:     { label: 'Pattern',      color: '#34d399' },
  algorithm:   { label: 'Algorithm',    color: '#fbbf24' },
  tc_sc:       { label: 'Time & Space', color: '#f87171' },
  overall:     { label: 'Overall',      color: '#e2e8f0' },
} as const

interface ChartPoint {
  date: string
  edge_cases?: number
  brute_force?: number
  pattern?: number
  algorithm?: number
  tc_sc?: number
  overall: number
}

function buildChartData(history: ProficiencySnapshot[], topic: string): ChartPoint[] {
  const topicHistory = history.filter(s => s.topic === topic)
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
      const overall = values.length > 0
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : 0
      return { date, ...stages, overall } as ChartPoint
    })
}

const stageLabel: Record<string, string> = {
  edge_cases:  'Edge Cases',
  brute_force: 'Brute Force',
  pattern:     'Pattern',
  algorithm:   'Algorithm',
  tc_sc:       'Time & Space',
}

export function StatsPage({
  onSmartPractice,
  activeTopics,
  onTopicsChange,
}: {
  onSmartPractice?: () => void
  activeTopics: string[]
  onTopicsChange: (topics: string[]) => void
}) {
  const [proficiencies, setProficiencies] = useState<TopicProficiency[]>([])
  const [allTags, setAllTags] = useState<ProblemTag[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [topicPickerOpen, setTopicPickerOpen] = useState(false)
  const [history, setHistory] = useState<ProficiencySnapshot[]>([])
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null)
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set())

  const toggleLine = (key: string) =>
    setHiddenLines(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getProficiency(controller.signal),
      getProblemTags(controller.signal),
      getProficiencyHistory(controller.signal),
    ])
      .then(([prof, tags, hist]) => {
        if (!controller.signal.aborted) {
          setProficiencies(prof)
          setAllTags(tags)
          setHistory(hist)
          setFetchError(false)
        }
      })
      .catch(() => { if (!controller.signal.aborted) setFetchError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const activeSet = new Set(activeTopics)

  const toggleTopic = (name: string) => {
    const next = activeTopics.includes(name)
      ? activeTopics.filter(t => t !== name)
      : [...activeTopics, name]
    if (next.length > 0) onTopicsChange(next)
  }

  const topicPicker = (
    <div className="mb-6">
      <button
        onClick={() => setTopicPickerOpen(o => !o)}
        aria-expanded={topicPickerOpen}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {topicPickerOpen ? '▾' : '▸'} Manage topics ({activeTopics.length} of {allTags.length} active)
      </button>
      {topicPickerOpen && (
        <div className="mt-3 flex flex-wrap gap-2">
          {allTags.map(tag => {
            const active = activeSet.has(tag.name)
            const isLast = active && activeTopics.length === 1
            return (
              <button
                key={tag.name}
                onClick={() => toggleTopic(tag.name)}
                disabled={isLast}
                title={isLast ? 'At least one topic must remain active' : undefined}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-muted-foreground border-border hover:border-foreground hover:text-foreground",
                  isLast && "opacity-50 cursor-not-allowed"
                )}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="text-sm text-muted-foreground">Failed to load stats. Please sign in and try again.</p>
        </div>
      </div>
    )
  }

  // Filter proficiencies to active topics only
  const filtered = proficiencies.filter(p => activeSet.has(p.topic))

  if (filtered.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">Topic Proficiency</h2>
            {onSmartPractice && (
              <Button size="sm" onClick={onSmartPractice}>Practice Weakest Topics</Button>
            )}
          </div>
          {topicPicker}
          <p className="text-sm text-muted-foreground">Complete a practice session to see your scores.</p>
        </div>
      </div>
    )
  }

  // Group by topic, compute avg per topic for sorting
  const topicMap = new Map<string, TopicProficiency[]>()
  for (const p of filtered) {
    const existing = topicMap.get(p.topic) ?? []
    topicMap.set(p.topic, [...existing, p])
  }

  const topics = Array.from(topicMap.entries())
    .map(([topic, rows]) => ({
      topic,
      rows,
      avg: rows.reduce((sum, r) => sum + r.score, 0) / rows.length,
    }))
    .sort((a, b) => a.avg - b.avg) // weakest first

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Topic Proficiency</h2>
          {onSmartPractice && (
            <Button size="sm" onClick={onSmartPractice}>Practice Weakest Topics</Button>
          )}
        </div>
        {topicPicker}
        <div className="flex flex-col gap-4">
          {topics.map(({ topic, rows }) => {
            const isExpanded = expandedTopic === topic
            const chartData = isExpanded ? buildChartData(history, topic) : []
            return (
              <div key={topic} className="rounded-md border border-border bg-muted p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">{topic}</p>
                  <button
                    onClick={() => setExpandedTopic(isExpanded ? null : topic)}
                    aria-expanded={isExpanded}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? '▾ Hide trend' : '▸ Show trend'}
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {rows.map(row => (
                    <div key={row.stage} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-24 shrink-0">
                        {stageLabel[row.stage] ?? row.stage}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            row.score >= 0.7 ? "bg-green-500" :
                            row.score >= 0.4 ? "bg-yellow-500" : "bg-red-500"
                          )}
                          style={{ width: `${Math.round(row.score * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right shrink-0">
                        {Math.round(row.score * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
                {isExpanded && (
                  <div className="mt-4">
                    {chartData.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Practice more sessions to see your trend.</p>
                    ) : (
                      <>
                      <ChartContainer config={chartConfig} className="h-48 w-full">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10 }}
                            tickFormatter={d => {
                              const date = new Date(d + 'T00:00:00')
                              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            }}
                          />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          {STAGES.map(stage => (
                            <Line
                              key={stage}
                              type="monotone"
                              dataKey={stage}
                              stroke={chartConfig[stage].color}
                              strokeWidth={1.5}
                              dot={false}
                              connectNulls
                              hide={hiddenLines.has(stage)}
                            />
                          ))}
                          <Line
                            type="monotone"
                            dataKey="overall"
                            stroke={chartConfig.overall.color}
                            strokeWidth={2}
                            dot={false}
                            strokeDasharray="4 2"
                            connectNulls
                            hide={hiddenLines.has('overall')}
                          />
                        </LineChart>
                      </ChartContainer>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                        {([...STAGES, 'overall'] as const).map(key => {
                          const hidden = hiddenLines.has(key)
                          return (
                            <button
                              key={key}
                              onClick={() => toggleLine(key)}
                              className="flex items-center gap-1.5 text-xs transition-opacity"
                              style={{ opacity: hidden ? 0.35 : 1 }}
                            >
                              <span
                                className="inline-block w-4 h-px"
                                style={key === 'overall'
                                  ? { borderTop: `1px dashed ${chartConfig.overall.color}` }
                                  : { backgroundColor: chartConfig[key].color }
                                }
                              />
                              <span className="text-muted-foreground">{chartConfig[key].label}</span>
                            </button>
                          )
                        })}
                      </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
