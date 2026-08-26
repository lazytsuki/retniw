'use client'

import { useFormStatus } from 'react-dom'

type AuthSubmitButtonProps = {
  isSignup: boolean
}

export function AuthSubmitButton({ isSignup }: AuthSubmitButtonProps) {
  const { pending } = useFormStatus()
  const label = isSignup ? '创建账号' : '登录'
  const pendingLabel = isSignup ? '正在创建并进入' : '正在登录'

  return (
    <button type="submit" disabled={pending} aria-busy={pending} aria-live="polite">
      {pending ? pendingLabel : label}
    </button>
  )
}
