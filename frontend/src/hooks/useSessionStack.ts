import { useState } from 'react'

interface SessionStack<T> {
  stack: T[]
  canGoBack: boolean
  push: (item: T) => void
  pop: () => T | undefined
  clear: () => void
}

export function useSessionStack<T>(): SessionStack<T> {
  const [stack, setStack] = useState<T[]>([])

  const push = (item: T) => setStack(s => [...s, item])

  const pop = (): T | undefined => {
    if (stack.length === 0) return undefined
    const top = stack[stack.length - 1]
    setStack(s => s.slice(0, -1))
    return top
  }

  const clear = () => setStack([])

  return { stack, canGoBack: stack.length > 0, push, pop, clear }
}
