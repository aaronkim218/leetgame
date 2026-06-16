import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionStack } from './useSessionStack'

describe('useSessionStack', () => {
  it('initial state: empty stack, canGoBack false', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    expect(result.current.stack).toEqual([])
    expect(result.current.canGoBack).toBe(false)
  })

  it('push: adds item, canGoBack becomes true', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('a')
    })
    expect(result.current.stack).toEqual(['a'])
    expect(result.current.canGoBack).toBe(true)
  })

  it('push multiple: stack grows in FIFO order', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('a')
      result.current.push('b')
      result.current.push('c')
    })
    expect(result.current.stack).toEqual(['a', 'b', 'c'])
  })

  it('pop on empty: returns undefined, stack stays empty, canGoBack stays false', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    let popped: string | undefined
    act(() => {
      popped = result.current.pop()
    })
    expect(popped).toBeUndefined()
    expect(result.current.stack).toEqual([])
    expect(result.current.canGoBack).toBe(false)
  })

  it('pop: returns top item and removes it', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('a')
      result.current.push('b')
    })
    let popped: string | undefined
    act(() => {
      popped = result.current.pop()
    })
    expect(popped).toBe('b')
    expect(result.current.stack).toEqual(['a'])
    expect(result.current.canGoBack).toBe(true)
  })

  it('pop until empty: canGoBack becomes false', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('a')
    })
    act(() => {
      result.current.pop()
    })
    expect(result.current.stack).toEqual([])
    expect(result.current.canGoBack).toBe(false)
  })

  it('clear: empties the stack, canGoBack becomes false', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('a')
      result.current.push('b')
    })
    act(() => {
      result.current.clear()
    })
    expect(result.current.stack).toEqual([])
    expect(result.current.canGoBack).toBe(false)
  })

  it('clear on empty stack: no-op', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.clear()
    })
    expect(result.current.stack).toEqual([])
    expect(result.current.canGoBack).toBe(false)
  })

  it('push after clear: stack has only the new item', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('a')
      result.current.push('b')
    })
    act(() => {
      result.current.clear()
    })
    act(() => {
      result.current.push('c')
    })
    expect(result.current.stack).toEqual(['c'])
    expect(result.current.canGoBack).toBe(true)
  })

  it('pop returns items in LIFO order', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('first')
      result.current.push('second')
      result.current.push('third')
    })
    const results: (string | undefined)[] = []
    act(() => {
      results.push(result.current.pop())
    })
    act(() => {
      results.push(result.current.pop())
    })
    act(() => {
      results.push(result.current.pop())
    })
    expect(results).toEqual(['third', 'second', 'first'])
    expect(result.current.canGoBack).toBe(false)
  })
})
