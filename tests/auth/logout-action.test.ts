import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServerAuthClient: vi.fn(),
  requireUser: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/src/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/src/lib/supabase/server', () => ({
  createServerAuthClient: mocks.createServerAuthClient,
}))

import { logout } from '@/app/auth/actions'

function form(expectedUserId: string) {
  const data = new FormData()
  data.set('expectedUserId', expectedUserId)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createServerAuthClient.mockResolvedValue({ auth: { signOut: mocks.signOut } })
  mocks.requireUser.mockResolvedValue({ id: 'current-owner' })
  mocks.signOut.mockResolvedValue({ error: null })
})

describe('logout account fence', () => {
  it('does not sign out an account selected in another tab', async () => {
    await expect(logout(form('previous-owner'))).rejects.toThrow('REDIRECT:/')
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('signs out the account that rendered the form', async () => {
    await expect(logout(form('current-owner'))).rejects.toThrow('REDIRECT:/login')
    expect(mocks.signOut).toHaveBeenCalledOnce()
  })
})
