'use server'

import { revalidatePath } from 'next/cache'
import { validateNickname } from '@/src/lib/auth/account-profile'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServerAuthClient } from '@/src/lib/supabase/server'

export type NicknameActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
  nickname: string | null
}

export async function updateNickname(
  previousState: NicknameActionState,
  formData: FormData,
): Promise<NicknameActionState> {
  const previousNickname = validateNickname(previousState.nickname ?? '')
  const safePreviousNickname = previousNickname.ok ? previousNickname.nickname : null
  const validation = validateNickname(formData.get('nickname'))
  if (!validation.ok) {
    return { status: 'error', message: validation.message, nickname: safePreviousNickname }
  }

  const supabase = await createServerAuthClient()
  let currentNickname = safePreviousNickname
  try {
    currentNickname = (await requireUser(supabase)).nickname
  } catch {
    return {
      status: 'error',
      message: '登录已失效，请重新登录后再保存。',
      nickname: safePreviousNickname,
    }
  }
  const updated = await supabase.auth
    .updateUser({ data: { nickname: validation.nickname } })
    .catch(() => ({ error: new Error('update failed') }))
  if (updated.error) {
    return {
      status: 'error',
      message: '昵称没有保存，请稍后再试。',
      nickname: currentNickname,
    }
  }

  const refreshed = await supabase.auth
    .refreshSession()
    .catch(() => ({ data: { session: null }, error: new Error('refresh failed') }))
  if (refreshed.error || !refreshed.data.session) {
    return {
      status: 'error',
      message: '昵称已保存，但登录信息没有刷新，请重新登录。',
      nickname: validation.nickname,
    }
  }

  revalidatePath('/', 'layout')
  return {
    status: 'success',
    message: validation.nickname ? '昵称已保存。' : '昵称已清除。',
    nickname: validation.nickname,
  }
}
