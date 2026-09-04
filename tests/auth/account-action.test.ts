import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServerAuthClient: vi.fn(),
  requireUser: vi.fn(),
  updateUser: vi.fn(),
  refreshSession: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/src/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/src/lib/supabase/server', () => ({
  createServerAuthClient: mocks.createServerAuthClient,
}))

import { updateNickname, type NicknameActionState } from '@/app/account/actions'

const previousState: NicknameActionState = {
  status: 'idle',
  message: '',
  nickname: 'Before',
}

function nicknameForm(value: string) {
  const form = new FormData()
  form.set('nickname', value)
  form.set('expectedUserId', 'owner')
  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createServerAuthClient.mockResolvedValue({
    auth: {
      updateUser: mocks.updateUser,
      refreshSession: mocks.refreshSession,
    },
  })
  mocks.requireUser.mockResolvedValue({ id: 'owner', email: 'owner@example.com', nickname: 'Before' })
  mocks.updateUser.mockResolvedValue({ data: { user: {} }, error: null })
  mocks.refreshSession.mockResolvedValue({ data: { session: {} }, error: null })
})

describe('updateNickname', () => {
  it('validates before touching the authenticated account', async () => {
    const result = await updateNickname(previousState, nicknameForm(`x\nAdmin`))

    expect(result).toMatchObject({ status: 'error', nickname: 'Before' })
    expect(mocks.createServerAuthClient).not.toHaveBeenCalled()
  })

  it('updates metadata, refreshes the session and revalidates authenticated pages', async () => {
    const result = await updateNickname(previousState, nicknameForm('  Winter  '))

    expect(mocks.requireUser).toHaveBeenCalledOnce()
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { nickname: 'Winter' } })
    expect(mocks.refreshSession).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(result).toEqual({ status: 'success', message: '昵称已保存。', nickname: 'Winter' })
  })

  it('clears the nickname with an empty value', async () => {
    const result = await updateNickname(previousState, nicknameForm('   '))

    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { nickname: null } })
    expect(result).toEqual({ status: 'success', message: '昵称已清除。', nickname: null })
  })

  it('does not update a different account after another tab switches the session', async () => {
    const form = nicknameForm('Winter')
    form.set('expectedUserId', 'previous-owner')

    await expect(updateNickname(previousState, form)).resolves.toMatchObject({
      status: 'error',
      message: '账号已在其他页面切换，请刷新后继续。',
      nickname: 'Before',
    })
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('returns an explicit state when authentication, update or refresh fails', async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error('expired'))
    await expect(updateNickname(previousState, nicknameForm('Winter'))).resolves.toMatchObject({
      status: 'error',
      message: '登录已失效，请重新登录后再保存。',
    })

    mocks.updateUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('update') })
    await expect(updateNickname(previousState, nicknameForm('Winter'))).resolves.toMatchObject({
      status: 'error',
      message: '昵称没有保存，请稍后再试。',
    })

    mocks.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('refresh') })
    await expect(updateNickname(previousState, nicknameForm('Winter'))).resolves.toEqual({
      status: 'error',
      message: '昵称已保存，但登录信息没有刷新，请重新登录。',
      nickname: 'Winter',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
