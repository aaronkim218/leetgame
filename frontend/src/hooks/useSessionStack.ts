import { useState } from 'react'

interface SessionStack<T> {
  stack: T[]
  canGoBack: boolean
  canGoForward: boolean
  push: (item: T) => void
  pop: (current: T | null) => T | undefined
  popForward: (current: T | null) => T | undefined
  clear: () => void
}

export function useSessionStack<T>(): SessionStack<T> {
  const [stack, setStack] = useState<T[]>([])
  const [forward, setForward] = useState<T[]>([])

  // any new navigation invalidates forward history, browser-style
  const push = (item: T) => {
    setStack((s) => [...s, item])
    setForward([])
  }

  const pop = (current: T | null): T | undefined => {
    if (stack.length === 0) return undefined
    const top = stack[stack.length - 1]
    setStack((s) => s.slice(0, -1))
    if (current !== null) setForward((f) => [...f, current])
    return top
  }

  const popForward = (current: T | null): T | undefined => {
    if (forward.length === 0) return undefined
    const top = forward[forward.length - 1]
    setForward((f) => f.slice(0, -1))
    if (current !== null) setStack((s) => [...s, current])
    return top
  }

  const clear = () => {
    setStack([])
    setForward([])
  }

  return {
    stack,
    canGoBack: stack.length > 0,
    canGoForward: forward.length > 0,
    push,
    pop,
    popForward,
    clear,
  }
}
