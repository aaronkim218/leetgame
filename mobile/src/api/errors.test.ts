import { ApiError } from './errors'

test('ApiError carries status and is an Error', () => {
  const e = new ApiError('nope', 404)
  expect(e).toBeInstanceOf(Error)
  expect(e).toBeInstanceOf(ApiError)
  expect(e.status).toBe(404)
  expect(e.message).toBe('nope')
})
