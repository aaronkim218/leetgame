import type { ActiveStage } from '../types'
import { CANONICAL_STAGES } from '../types'
import type { Theme } from '../hooks/useTheme'
import { Checkbox } from './ui/checkbox'

const STAGE_META: Record<ActiveStage, { label: string; description: string }> = {
  edge_cases:  { label: 'Edge Cases',        description: 'Identify boundary conditions and gotchas' },
  brute_force: { label: 'Brute Force',       description: 'Describe the naive solution' },
  pattern:     { label: 'Optimal Pattern',   description: 'Identify the algorithm pattern' },
  algorithm:   { label: 'Optimal Algorithm', description: 'Describe the optimal algorithm' },
  tc_sc:       { label: 'Time & Space',      description: 'State time and space complexity' },
}

interface Props {
  activeStages: ActiveStage[]
  onChange: (stages: ActiveStage[]) => void
  hideTitle: boolean
  onHideTitleChange: (value: boolean) => void
  hideDifficulty: boolean
  onHideDifficultyChange: (value: boolean) => void
  onTakeTour?: () => void
  theme: Theme
  onThemeChange: (t: Theme) => void
}

export function StagesSettings({ activeStages, onChange, hideTitle, onHideTitleChange, hideDifficulty, onHideDifficultyChange, onTakeTour, theme, onThemeChange }: Props) {
  const toggle = (stage: ActiveStage) => {
    const isActive = activeStages.includes(stage)
    if (isActive && activeStages.length === 1) return
    const next = isActive
      ? activeStages.filter(s => s !== stage)
      : CANONICAL_STAGES.filter(s => activeStages.includes(s) || s === stage)
    onChange(next)
  }

  return (
    <div className="py-2">
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Display
      </p>
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-sm font-medium">Theme</span>
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {(['system', 'light', 'dark'] as const).map(t => (
            <button
              key={t}
              type="button"
              aria-pressed={theme === t}
              onClick={() => onThemeChange(t)}
              className={`px-2.5 py-1 capitalize transition-colors ${
                theme === t
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={() => onHideTitleChange(!hideTitle)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted cursor-pointer transition-colors"
      >
        <Checkbox checked={hideTitle} onCheckedChange={v => onHideTitleChange(v === true)} />
        <div>
          <p className="text-sm font-medium">Hide problem title</p>
          <p className="text-xs text-muted-foreground">Reveal on click to test recall</p>
        </div>
      </button>
      <button
        onClick={() => onHideDifficultyChange(!hideDifficulty)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted cursor-pointer transition-colors"
      >
        <Checkbox checked={hideDifficulty} onCheckedChange={v => onHideDifficultyChange(v === true)} />
        <div>
          <p className="text-sm font-medium">Hide difficulty</p>
          <p className="text-xs text-muted-foreground">Reveal on click to test recall</p>
        </div>
      </button>
      <div className="mx-3 my-2 border-t border-border" />
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Practice Stages
      </p>
      {CANONICAL_STAGES.map(stage => {
        const active = activeStages.includes(stage)
        const isLast = active && activeStages.length === 1
        const meta = STAGE_META[stage]
        return (
          <button
            key={stage}
            onClick={() => toggle(stage)}
            disabled={isLast}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${isLast ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}`}
          >
            <Checkbox checked={active} disabled={isLast} onCheckedChange={() => toggle(stage)} />
            <div>
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </div>
          </button>
        )
      })}
      {onTakeTour && (
        <>
          <div className="mx-3 my-2 border-t border-border" />
          <button
            onClick={onTakeTour}
            className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Take a tour
          </button>
        </>
      )}
    </div>
  )
}
