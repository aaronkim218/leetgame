import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ActiveStage } from '../types'

const authState = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  callback: (_event: string, _session: unknown) => {},
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authState.callback = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signInWithPassword: vi.fn(async () => ({})),
    },
  },
}))

vi.mock('../api', () => ({
  getStreak: vi.fn(async () => ({ streak: 1, last_practiced_at: null })),
  recordStreak: vi.fn(async () => ({ streak: 1, last_practiced_at: null })),
  getSettings: vi.fn(),
  updateSettings: vi.fn(async () => {}),
}))

import { useAuth } from './useAuth'
import { getSettings, updateSettings } from '../api'

const fakeSession = { access_token: 't' }

beforeEach(() => {
  vi.mocked(updateSettings).mockClear()
  localStorage.clear()
})

describe('settings clobber gate', () => {
  it('failed settings load: toggle updates state but skips the PUT', async () => {
    vi.mocked(getSettings).mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useAuth())
    act(() => {
      authState.callback('SIGNED_IN', fakeSession)
    })
    await waitFor(() => expect(result.current.settingsReady).toBe(true))

    act(() => {
      result.current.persistConciseMode(true)
    })
    expect(result.current.conciseMode).toBe(true)
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('successful load: toggle PUTs the merged server values', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      active_stages: ['pattern', 'algorithm'] as ActiveStage[],
      hide_title: false,
      hide_difficulty: true,
      concise_mode: false,
      active_topics: ['Array'],
      tour_done: true,
    })
    const { result } = renderHook(() => useAuth())
    act(() => {
      authState.callback('SIGNED_IN', fakeSession)
    })
    await waitFor(() => expect(result.current.settingsReady).toBe(true))

    act(() => {
      result.current.persistConciseMode(true)
    })
    expect(result.current.conciseMode).toBe(true)
    expect(updateSettings).toHaveBeenCalledWith(
      ['pattern', 'algorithm'],
      false,
      true,
      true,
      ['Array'],
      true,
    )
  })

  it('a stale settings fetch from a previous sign-in cannot re-arm the gate', async () => {
    let resolveStale: (v: unknown) => void = () => {}
    vi.mocked(getSettings)
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveStale = resolve)) as never,
      )
      .mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useAuth())
    act(() => {
      authState.callback('SIGNED_IN', fakeSession) // user A, fetch stays pending
    })
    act(() => {
      authState.callback('SIGNED_OUT', null)
    })
    act(() => {
      authState.callback('SIGNED_IN', fakeSession) // user B, fetch rejects
    })
    await waitFor(() => expect(result.current.settingsReady).toBe(true))
    await act(async () => {
      resolveStale({
        active_stages: ['edge_cases'],
        hide_title: false,
        hide_difficulty: false,
        concise_mode: true,
        active_topics: ['Trie'],
        tour_done: false,
      }) // user A's stale payload arrives late
    })
    expect(result.current.conciseMode).toBe(false) // stale payload NOT applied
    act(() => {
      result.current.persistStages(['pattern'])
    })
    expect(updateSettings).not.toHaveBeenCalled() // gate NOT re-armed
  })

  it('anonymous toggle still writes localStorage and never PUTs', async () => {
    const { result } = renderHook(() => useAuth())
    act(() => {
      authState.callback('INITIAL_SESSION', null)
    })
    await waitFor(() => expect(result.current.settingsReady).toBe(true))

    act(() => {
      result.current.persistConciseMode(true)
    })
    expect(localStorage.getItem('leetgame_concise_mode')).toBe('true')
    expect(updateSettings).not.toHaveBeenCalled()
  })
})
