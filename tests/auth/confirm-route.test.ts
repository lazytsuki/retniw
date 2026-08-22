import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  createServerAuthClient: vi.fn(),
}))

vi.mock('@/src/lib/supabase/server', () => ({
  createServerAuthClient: mocks.createServerAuthClient,
}))

import { GET } from '@/app/auth/confirm/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createServerAuthClient.mockResolvedValue({ auth: { verifyOtp: mocks.verifyOtp } })
})
describe('signup confirmation route', () => {
  it('exchanges a signup token for the cookie-backed session and removes it from the redirect', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null })
    const response = await GET(new NextRequest(
      'https://retniw.cn/auth/confirm?token_hash=secret-token&type=email',
    ))

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'secret-token',
      type: 'email',
    })
    expect(response.headers.get('location')).toBe('https://retniw.cn/')
  })

  it('returns the same non-sensitive error for invalid and expired links', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { message: 'expired' } })
    const response = await GET(new NextRequest(
      'https://retniw.cn/auth/confirm?token_hash=expired-token&type=email',
    ))

    expect(response.headers.get('location')).toBe(
      'https://retniw.cn/login?error=confirm-failed',
    )
  })

  it('does not call Supabase for unrelated auth link types', async () => {
    const response = await GET(new NextRequest(
      'https://retniw.cn/auth/confirm?token_hash=secret-token&type=recovery',
    ))

    expect(mocks.verifyOtp).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe(
      'https://retniw.cn/login?error=confirm-failed',
    )
  })
})
