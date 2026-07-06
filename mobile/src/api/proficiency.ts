import type { TopicProficiency } from '../types'
import { API_URL, authHeaders } from './client'

export async function getProficiency(): Promise<TopicProficiency[]> {
  const res = await fetch(`${API_URL}/api/proficiency`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch proficiency: ${res.status}`)
  return res.json()
}
