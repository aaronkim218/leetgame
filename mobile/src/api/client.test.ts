jest.mock('../auth/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: 'tok123' } },
      })),
    },
  },
}))

import { authHeaders } from './client'
import { supabase } from '../auth/supabase'

test('authHeaders returns Bearer header when a session exists', async () => {
  expect(await authHeaders()).toEqual({ Authorization: 'Bearer tok123' })
})

test('authHeaders returns empty object when anonymous', async () => {
  ;(supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
    data: { session: null },
  })
  expect(await authHeaders()).toEqual({})
})
