jest.mock('./client', () => ({
  API_URL: 'https://api.test',
  authHeaders: jest.fn(async () => ({ Authorization: 'Bearer t' })),
}))

import {
  getRandomProblem,
  getSmartPracticeProblem,
  getProblemTags,
} from './problems'

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
    json: async () => problem,
  })) as unknown as typeof fetch
})

test('getRandomProblem hits the random endpoint with auth header', async () => {
  const result = await getRandomProblem()
  expect(result).toEqual(problem)
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://api.test/api/problems/random',
    { headers: { Authorization: 'Bearer t' } },
  )
})

test('getSmartPracticeProblem encodes active stages and topics', async () => {
  await getSmartPracticeProblem(['pattern', 'tc_sc'], ['Array', 'Graph'])
  const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string
  expect(url).toContain('/api/problems/smart?')
  expect(url).toContain('active_stages=pattern%2Ctc_sc')
  expect(url).toContain('active_topics=Array%2CGraph')
})

test('getProblemTags hits the tags endpoint with auth header', async () => {
  const tags = [{ name: 'Array', count: 12 }]
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => tags,
  })) as unknown as typeof fetch
  const result = await getProblemTags()
  expect(result).toEqual(tags)
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://api.test/api/problems/tags',
    { headers: { Authorization: 'Bearer t' } },
  )
})
