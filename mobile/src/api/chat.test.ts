jest.mock('./client', () => ({
  API_URL: 'https://api.test',
  authHeaders: jest.fn(async () => ({ Authorization: 'Bearer t' })),
}))

const mockFetch = jest.fn()
jest.mock('expo/fetch', () => ({ fetch: (...a: unknown[]) => mockFetch(...a) }))

import { streamChat } from './chat'

beforeEach(() => mockFetch.mockClear())

function streamFrom(chunks: string[]) {
  const enc = new TextEncoder()
  let i = 0
  return {
    getReader() {
      return {
        read: async () =>
          i < chunks.length
            ? { done: false, value: enc.encode(chunks[i++]) }
            : { done: true, value: undefined },
      }
    },
  }
}

test('yields tokens then done, splitting across chunk boundaries', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    body: streamFrom([
      'event: token\ndata: {"content":"Hel',
      'lo"}\n\nevent: token\ndata: {"content":" world"}\n\n',
      'event: done\ndata: {"stage":"algorithm","message":"done!"}\n\n',
    ]),
  })

  const events = []
  for await (const e of streamChat('p1', 'pattern', ['pattern', 'algorithm'], [], 'hi', false, false, false)) {
    events.push(e)
  }

  expect(events).toEqual([
    { type: 'token', content: 'Hello' },
    { type: 'token', content: ' world' },
    { type: 'done', stage: 'algorithm', message: 'done!' },
  ])
})

test('throws when the server emits an error event', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    body: streamFrom(['event: error\ndata: {}\n\n']),
  })
  await expect(async () => {
    for await (const _ of streamChat('p1', 'pattern', ['pattern'], [], 'hi', false, false, false)) {
      void _
    }
  }).rejects.toThrow('LLM evaluation failed')
})

test('sends the correct request body', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    body: streamFrom(['event: done\ndata: {"stage":"complete","message":"m"}\n\n']),
  })
  for await (const _ of streamChat('p1', 'pattern', ['pattern'], [{ role: 'user', content: 'prev' }], 'hi', true, false, true)) {
    void _
  }
  const [, init] = mockFetch.mock.calls[0]
  const body = JSON.parse(init.body)
  expect(body).toEqual({
    problem_id: 'p1',
    stage: 'pattern',
    active_stages: ['pattern'],
    history: [{ role: 'user', content: 'prev' }],
    message: 'hi',
    hint_requested: true,
    answer_requested: false,
    concise: true,
  })
})
