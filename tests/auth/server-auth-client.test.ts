import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
  getSupabasePublicConfig: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }))
vi.mock('server-only', () => ({}))
vi.mock('@/src/lib/supabase/config', () => ({
  getSupabasePublicConfig: mocks.getSupabasePublicConfig,
}))

import { createServerAuthClient } from '@/src/lib/supabase/server'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSupabasePublicConfig.mockReturnValue({
    url: 'https://project.supabase.co',
    publishableKey: 'publishable-key',
  })
})

describe('server auth cookie bridge', () => {
  it('writes the session cookies emitted by signUp into the Next.js response', async () => {
    const cookieStore = { getAll: vi.fn().mockReturnValue([]), set: vi.fn() }
    mocks.cookies.mockResolvedValue(cookieStore)
    let cookieAdapter: {
      getAll: () => unknown[]
      setAll: (values: Array<{
        name: string
        value: string
        options: { httpOnly?: boolean; sameSite?: string }
      }>) => void
    } | undefined
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      cookieAdapter = options.cookies
      return { auth: {} }
    })

    await createServerAuthClient()
    cookieAdapter?.setAll([{
      name: 'sb-session',
      value: 'session-value',
      options: { httpOnly: true, sameSite: 'lax' },
    }])

    expect(cookieStore.set).toHaveBeenCalledWith(
      'sb-session',
      'session-value',
      { httpOnly: true, sameSite: 'lax' },
    )
  })
})
