import type { ActiveStage } from '../types'

const stageBannerBase: Record<ActiveStage, string> = {
  edge_cases: 'What edge cases does this problem have?',
  brute_force: 'What is the brute force approach?',
  pattern: 'What pattern does this problem use?',
  algorithm: 'Describe your algorithm',
  tc_sc: 'Describe the time and space complexity',
}

const stagePrev: Partial<Record<ActiveStage, ActiveStage>> = {
  algorithm: 'pattern',
  tc_sc: 'algorithm',
}

const stageLabel: Partial<Record<ActiveStage, string>> = {
  pattern: 'Pattern',
  algorithm: 'Algorithm',
}

export const STAGE_PLACEHOLDER: Record<ActiveStage, string> = {
  edge_cases: 'e.g. empty input, single element, negative numbers, overflow…',
  brute_force: 'Describe the naive solution…',
  pattern: 'e.g. sliding window, BFS/DFS, dynamic programming…',
  algorithm: 'Describe your algorithm…',
  tc_sc: 'State your time and space complexity…',
}

export function getStageBanner(
  stage: ActiveStage,
  sessionActiveStages: ActiveStage[],
): string {
  const prev = stagePrev[stage]
  if (prev && sessionActiveStages.includes(prev)) {
    return `${stageLabel[prev]} ✓ — ${stageBannerBase[stage]}`
  }
  return stageBannerBase[stage]
}
