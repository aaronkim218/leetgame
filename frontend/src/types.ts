// frontend/src/types.ts
export interface Problem {
  id: string
  slug: string
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topic_tags: string[]
  leetcode_id: number | null
}

export interface ProblemSearchResponse {
  problems: Problem[]
  page: number
  page_size: number
  total: number
}

export interface ProblemTag {
  name: string
  count: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  marker?: 'hint' | 'answer'
}

export type ActiveStage = 'edge_cases' | 'brute_force' | 'pattern' | 'algorithm' | 'tc_sc'

export type Stage = ActiveStage | 'complete'

export const CANONICAL_STAGES: ActiveStage[] = [
  'edge_cases', 'brute_force', 'pattern', 'algorithm', 'tc_sc',
]

export const DEFAULT_STAGES: ActiveStage[] = ['pattern', 'algorithm', 'tc_sc']

export type View = 'practice' | 'search' | 'stats' | 'mission'

export interface TopicProficiency {
  user_id: string
  topic: string
  stage: string
  score: number
  updated_at: string
}

export interface ProficiencySnapshot {
  topic: string
  stage: string
  score: number
  snapshot_date: string
}

export interface ChatResponse {
  message: string
  stage: Stage
}

export interface SearchState {
  q: string
  difficulties: string[]
  tags: string[]
  tagMatch: 'and' | 'or'
  results: Problem[]
  page: number
  total: number
  hasSearched: boolean
}

export const defaultSearchState: SearchState = {
  q: '',
  difficulties: [],
  tags: [],
  tagMatch: 'and',
  results: [],
  page: 1,
  total: 0,
  hasSearched: false,
}

export const NEETCODE_TOPICS: string[] = [
  'Array', 'Hash Table', 'Two Pointers', 'Sliding Window',
  'Stack', 'Binary Search', 'Linked List',
  'Tree', 'Binary Tree', 'Binary Search Tree',
  'Trie', 'Heap (Priority Queue)', 'Backtracking',
  'Graph', 'Depth-First Search', 'Breadth-First Search', 'Union Find',
  'Dynamic Programming', 'Greedy', 'Intervals', 'Math', 'Bit Manipulation',
  'Matrix',
]
