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
      popped = result.current.pop(null)
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
      popped = result.current.pop(null)
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
      result.current.pop(null)
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
      results.push(result.current.pop(null))
    })
    act(() => {
      results.push(result.current.pop(null))
    })
    act(() => {
      results.push(result.current.pop(null))
    })
    expect(results).toEqual(['third', 'second', 'first'])
    expect(result.current.canGoBack).toBe(false)
  })

  describe('forward history', () => {
    it('initial state: canGoForward false', () => {
      const { result } = renderHook(() => useSessionStack<string>())
      expect(result.current.canGoForward).toBe(false)
    })

    it('pop with current: moves current to forward, popForward returns it', () => {
      const { result } = renderHook(() => useSessionStack<string>())
      act(() => {
        result.current.push('a')
      })
      let popped: string | undefined
      act(() => {
        popped = result.current.pop('b')
      })
      expect(popped).toBe('a')
      expect(result.current.canGoForward).toBe(true)
      let forwarded: string | undefined
      act(() => {
        forwarded = result.current.popForward('a')
      })
      expect(forwarded).toBe('b')
      expect(result.current.canGoForward).toBe(false)
      // 'a' went back onto the back stack
      expect(result.current.stack).toEqual(['a'])
    })

    it('pop with null current: forward stays empty', () => {
      const { result } = renderHook(() => useSessionStack<string>())
      act(() => {
        result.current.push('a')
      })
      act(() => {
        result.current.pop(null)
      })
      expect(result.current.canGoForward).toBe(false)
    })

    it('pop on empty back stack: current is not moved to forward', () => {
      const { result } = renderHook(() => useSessionStack<string>())
      act(() => {
        result.current.pop('b')
      })
      expect(result.current.canGoForward).toBe(false)
    })

    it('popForward on empty: returns undefined, back stack untouched', () => {
      const { result } = renderHook(() => useSessionStack<string>())
      let forwarded: string | undefined
      act(() => {
        forwarded = result.current.popForward('x')
      })
      expect(forwarded).toBeUndefined()
      expect(result.current.stack).toEqual([])
    })

    it('push clears forward history', () => {
      const { result } = renderHook(() => useSessionStack<string>())
      act(() => {
        result.current.push('a')
      })
      act(() => {
        result.current.pop('b')
      })
      act(() => {
        result.current.push('c')
      })
      expect(result.current.canGoForward).toBe(false)
    })

    it('clear empties forward history', () => {
      const { result } = renderHook(() => useSessionStack<string>())
      act(() => {
        result.current.push('a')
      })
      act(() => {
        result.current.pop('b')
      })
      act(() => {
        result.current.clear()
      })
      expect(result.current.canGoForward).toBe(false)
    })

    it('back back forward forward replays in order', () => {
      const { result } = renderHook(() => useSessionStack<string>())
      act(() => {
        result.current.push('a')
        result.current.push('b')
      })
      const replay: (string | undefined)[] = []
      act(() => {
        replay.push(result.current.pop('c'))
      })
      act(() => {
        replay.push(result.current.pop('b'))
      })
      act(() => {
        replay.push(result.current.popForward('a'))
      })
      act(() => {
        replay.push(result.current.popForward('b'))
      })
      expect(replay).toEqual(['b', 'a', 'b', 'c'])
      expect(result.current.stack).toEqual(['a', 'b'])
      expect(result.current.canGoForward).toBe(false)
    })
  })
})
