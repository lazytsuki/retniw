export const expectedUserIdHeader = 'x-retniw-expected-user-id'
export const expectedUserIdQuery = 'expectedUserId'
export const authContextChangedEvent = 'retniw:auth-context-changed'

type ErrorPayload = {
  error?: { code?: unknown }
}

export async function userBoundFetch(
  expectedUserId: string,
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  if (!expectedUserId) throw new Error('AUTH_CONTEXT_MISSING')
  const headers = new Headers(init.headers)
  headers.set(expectedUserIdHeader, expectedUserId)
  const response = await fetch(input, { ...init, headers })

  if (response.status === 409 && typeof window !== 'undefined') {
    const payload = await response.clone().json().catch(() => null) as ErrorPayload | null
    if (payload?.error?.code === 'AUTH_CONTEXT_CHANGED') {
      window.dispatchEvent(new Event(authContextChangedEvent))
    }
  }

  return response
}

export function currentPageUserId() {
  if (typeof document === 'undefined') throw new Error('AUTH_CONTEXT_MISSING')
  const root = document.querySelector<HTMLElement>('[data-retniw-user-id]')
  const userId = root?.dataset.retniwUserId
  if (!userId) throw new Error('AUTH_CONTEXT_MISSING')
  return userId
}

export function currentUserBoundFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return userBoundFetch(currentPageUserId(), input, init)
}
