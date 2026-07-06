jest.mock('./client', () => ({
  API_URL: 'https://api.test',
  authHeaders: jest.fn(async () => ({ Authorization: 'Bearer t' })),
}))

import {
  getRandomProblem,
  getSmartPracticeProblem,
  getProblemTags,
  searchProblems,
  getRandomProblemFiltered,
} from './problems'
import { ApiError } from './errors'

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

test('searchProblems encodes all filters, page, and page_size', async () => {
  const response = { problems: [problem], page: 2, page_size: 12, total: 40 }
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => response,
  })) as unknown as typeof fetch
  const result = await searchProblems(
    'two sum',
    ['Easy', 'Medium'],
    ['Array', 'Hash Table'],
    'or',
    2,
    12,
  )
  expect(result).toEqual(response)
  const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string
  expect(url).toContain('/api/problems?')
  expect(url).toContain('q=two+sum')
  expect(url).toContain('difficulty=Easy%2CMedium')
  expect(url).toContain('tags=Array%2CHash+Table')
  expect(url).toContain('tag_match=or')
  expect(url).toContain('page=2')
  expect(url).toContain('page_size=12')
})

test('searchProblems omits empty filters and tag_match without tags', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ problems: [], page: 1, page_size: 12, total: 0 }),
  })) as unknown as typeof fetch
  await searchProblems('', [], [], 'and', 1, 12)
  const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string
  expect(url).not.toContain('q=')
  expect(url).not.toContain('difficulty=')
  expect(url).not.toContain('tags=')
  expect(url).not.toContain('tag_match=')
  expect(url).toContain('page=1')
  expect(url).toContain('page_size=12')
})

test('searchProblems forwards the abort signal', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ problems: [], page: 1, page_size: 12, total: 0 }),
  })) as unknown as typeof fetch
  const controller = new AbortController()
  await searchProblems('', [], [], 'and', 1, 12, controller.signal)
  const init = (globalThis.fetch as jest.Mock).mock.calls[0][1] as {
    signal?: AbortSignal
  }
  expect(init.signal).toBe(controller.signal)
})

test('getRandomProblemFiltered encodes filters and exclude_id', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => problem,
  })) as unknown as typeof fetch
  await getRandomProblemFiltered('sum', ['Hard'], ['Graph'], 'and', 'p9')
  const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string
  expect(url).toContain('/api/problems/random?')
  expect(url).toContain('q=sum')
  expect(url).toContain('difficulty=Hard')
  expect(url).toContain('tags=Graph')
  expect(url).toContain('tag_match=and')
  expect(url).toContain('exclude_id=p9')
})

test('getRandomProblemFiltered throws ApiError with status on non-OK', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: false,
    status: 404,
  })) as unknown as typeof fetch
  const err = await getRandomProblemFiltered('', [], [], 'and').catch(
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(ApiError)
  expect((err as ApiError).status).toBe(404)
})

test('searchProblems throws a plain Error (not ApiError) on non-OK', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: false,
    status: 500,
  })) as unknown as typeof fetch
  const err = await searchProblems('', [], [], 'and', 1, 12).catch(
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(Error)
  expect(err).not.toBeInstanceOf(ApiError)
})
