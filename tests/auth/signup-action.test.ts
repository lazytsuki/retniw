import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  createServerAuthClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/src/lib/supabase/server', () => ({
  createServerAuthClient: mocks.createServerAuthClient,
}))

import { login, signup } from '@/app/login/actions'

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`)
  }
}

function form(values: Record<string, string>) {
  const data = new FormData()
  Object.entries(values).forEach(([key, value]) => data.set(key, value))
  return data
}

const signupForm = () => form({
  email: 'friend@example.com',
  password: 'password',
  passwordConfirmation: 'password',
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.redirect.mockImplementation((url: string) => {
    throw new RedirectSignal(url)
  })
  mocks.createServerAuthClient.mockResolvedValue({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
    },
  })
})

describe('login action', () => {
  it('keeps the existing generic invalid-credential response', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { message: 'invalid' } })

    await expect(login(form({ email: 'friend@example.com', password: 'wrong' })))
      .rejects.toMatchObject({ url: '/login?error=invalid' })
  })
})

describe('signup action', () => {
  it('stops invalid local input before contacting Supabase', async () => {
    const input = form({
      email: 'friend@example.com',
      password: 'short',
      passwordConfirmation: 'short',
    })

    await expect(signup(input)).rejects.toMatchObject({
      url: '/login?mode=signup&error=invalid-password',
    })
    expect(mocks.createServerAuthClient).not.toHaveBeenCalled()
  })

  it('redirects into the product when Supabase returns a session', async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: 'new-user' }, session: { access_token: 'session' } },
      error: null,
    })

    await expect(signup(signupForm())).rejects.toMatchObject({ url: '/' })
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: 'friend@example.com',
      password: 'password',
    })
  })

  it('shows the confirmation state when Supabase requires email confirmation', async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: 'new-user' }, session: null },
      error: null,
    })

    await expect(signup(signupForm())).rejects.toMatchObject({
      url: '/login?notice=check-email',
    })
  })

  it('does not expose whether the email is already registered', async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    })

    await expect(signup(signupForm())).rejects.toMatchObject({
      url: '/login?mode=signup&error=signup-failed',
    })
  })
})
