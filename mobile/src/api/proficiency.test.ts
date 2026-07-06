jest.mock('./client', () => ({
  API_URL: 'https://api.test',
  authHeaders: jest.fn(async () => ({ Authorization: 'Bearer t' })),
}))

import { getProficiency } from './proficiency'

const rows = [
  {
    user_id: 'u1',
    topic: 'Array',
    stage: 'pattern',
    score: 0.5,
    updated_at: '2026-07-01T00:00:00Z',
  },
]

test('getProficiency hits the proficiency endpoint with auth header', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => rows,
  })) as unknown as typeof fetch
  const result = await getProficiency()
  expect(result).toEqual(rows)
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://api.test/api/proficiency',
    { headers: { Authorization: 'Bearer t' } },
  )
})

test('getProficiency throws on non-OK response', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: false,
    status: 401,
  })) as unknown as typeof fetch
  await expect(getProficiency()).rejects.toThrow('401')
})
