import { CANONICAL_STAGES, type ActiveStage } from '../types'

export function toggleStage(
  activeStages: ActiveStage[],
  stage: ActiveStage,
): ActiveStage[] {
  const isActive = activeStages.includes(stage)
  if (isActive && activeStages.length === 1) return activeStages
  return isActive
    ? activeStages.filter((s) => s !== stage)
    : CANONICAL_STAGES.filter((s) => activeStages.includes(s) || s === stage)
}
