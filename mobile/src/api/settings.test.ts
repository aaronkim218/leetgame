jest.mock('../auth/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: 'tok' } },
      })),
    },
  },
}))

import { updateSettings } from './settings'

test('updateSettings PUTs the full six-field snake_case body with auth', async () => {
  const fetchMock = jest.fn(async () => ({ ok: true }))
  globalThis.fetch = fetchMock as unknown as typeof fetch

  await updateSettings(['pattern'], true, false, true, ['Array'], false)

  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    { method: string; headers: Record<string, string>; body: string },
  ]
  expect(url).toContain('/api/settings')
  expect(init.method).toBe('PUT')
  expect(init.headers.Authorization).toBe('Bearer tok')
  expect(JSON.parse(init.body)).toEqual({
    active_stages: ['pattern'],
    hide_title: true,
    hide_difficulty: false,
    concise_mode: true,
    active_topics: ['Array'],
    tour_done: false,
  })
})

test('updateSettings throws on non-OK response', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: false,
    status: 500,
  })) as unknown as typeof fetch
  await expect(
    updateSettings(['pattern'], true, true, false, [], false),
  ).rejects.toThrow('Failed to update settings: 500')
})
