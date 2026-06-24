import { supabase } from '../auth/supabase'

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? ''

export async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}
