import { API_URL, authHeaders } from './client'

export async function getStreak(): Promise<{
  streak: number
  last_practiced_at: string | null
}> {
  const res = await fetch(`${API_URL}/api/streak`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get streak: ${res.status}`)
  return res.json()
}

export async function recordStreak(): Promise<{
  streak: number
  last_practiced_at: string | null
}> {
  const res = await fetch(`${API_URL}/api/streak`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to record streak: ${res.status}`)
  return res.json()
}
