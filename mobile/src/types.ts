export interface Problem {
  id: string
  slug: string
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topic_tags: string[]
  leetcode_id: number | null
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  marker?: 'hint' | 'answer'
}

export type ActiveStage =
  'edge_cases' | 'brute_force' | 'pattern' | 'algorithm' | 'tc_sc'

export type Stage = ActiveStage | 'complete'

export const CANONICAL_STAGES: ActiveStage[] = [
  'edge_cases',
  'brute_force',
  'pattern',
  'algorithm',
  'tc_sc',
]

export const DEFAULT_STAGES: ActiveStage[] = ['pattern', 'algorithm', 'tc_sc']

export interface TopicProficiency {
  user_id: string
  topic: string
  stage: string
  score: number
  updated_at: string
}

export const NEETCODE_TOPICS: string[] = [
  'Array',
  'Hash Table',
  'Two Pointers',
  'Sliding Window',
  'Stack',
  'Binary Search',
  'Linked List',
  'Tree',
  'Binary Tree',
  'Binary Search Tree',
  'Trie',
  'Heap (Priority Queue)',
  'Backtracking',
  'Graph',
  'Depth-First Search',
  'Breadth-First Search',
  'Union Find',
  'Dynamic Programming',
  'Greedy',
  'Intervals',
  'Math',
  'Bit Manipulation',
  'Matrix',
]
