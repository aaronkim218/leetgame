import type { Problem } from '../types'
import { API_URL, authHeaders } from './client'

export async function getSavedProblems(): Promise<Problem[]> {
  const res = await fetch(`${API_URL}/api/saved`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch saved problems: ${res.status}`)
  return res.json()
}

export async function saveProblem(problemId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/saved/${problemId}`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to save problem: ${res.status}`)
}

export async function unsaveProblem(problemId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/saved/${problemId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to unsave problem: ${res.status}`)
}
