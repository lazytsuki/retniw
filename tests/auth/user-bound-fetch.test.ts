import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authContextChangedEvent,
  expectedUserIdHeader,
  userBoundFetch,
} from '@/src/lib/auth/user-bound-fetch'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('userBoundFetch', () => {
  it('binds the request to the page account', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await userBoundFetch('page-user', '/api/thoughts', {
      headers: { accept: 'application/json' },
    })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get(expectedUserIdHeader)).toBe('page-user')
    expect(headers.get('accept')).toBe('application/json')
  })

  it('announces a changed account without consuming the response body', async () => {
    const response = Response.json(
      { error: { code: 'AUTH_CONTEXT_CHANGED' } },
      { status: 409 },
    )
    const dispatchEvent = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    vi.stubGlobal('window', { dispatchEvent })

    const result = await userBoundFetch('page-user', '/api/review')

    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: authContextChangedEvent })
    await expect(result.json()).resolves.toEqual({ error: { code: 'AUTH_CONTEXT_CHANGED' } })
  })

  it('does not announce unrelated conflicts', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
      { error: { code: 'STATE_CONFLICT' } },
      { status: 409 },
    )))
    vi.stubGlobal('window', { dispatchEvent })

    await userBoundFetch('page-user', '/api/review')

    expect(dispatchEvent).not.toHaveBeenCalled()
  })
})
