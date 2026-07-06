jest.mock('./client', () => ({
  API_URL: 'https://api.test',
  authHeaders: jest.fn(async () => ({ Authorization: 'Bearer t' })),
}))

import { getSavedProblems, saveProblem, unsaveProblem } from './saved'

const problem = {
  id: 'p1',
  slug: 's',
  title: 'T',
  description: 'D',
  difficulty: 'Easy',
  topic_tags: [],
  leetcode_id: 1,
}

beforeEach(() => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => [problem],
  })) as unknown as typeof fetch
})

test('getSavedProblems hits the saved endpoint with auth header', async () => {
  const result = await getSavedProblems()
  expect(result).toEqual([problem])
  expect(globalThis.fetch).toHaveBeenCalledWith('https://api.test/api/saved', {
    headers: { Authorization: 'Bearer t' },
  })
})

test('saveProblem POSTs to the problem-scoped route', async () => {
  await saveProblem('p1')
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://api.test/api/saved/p1',
    { method: 'POST', headers: { Authorization: 'Bearer t' } },
  )
})

test('unsaveProblem DELETEs the problem-scoped route', async () => {
  await unsaveProblem('p1')
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://api.test/api/saved/p1',
    { method: 'DELETE', headers: { Authorization: 'Bearer t' } },
  )
})

test('saveProblem throws on non-OK', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: false,
    status: 401,
  })) as unknown as typeof fetch
  await expect(saveProblem('p1')).rejects.toThrow('401')
})
