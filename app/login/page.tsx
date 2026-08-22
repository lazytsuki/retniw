import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerAuthClient } from '@/src/lib/supabase/server'
import { MIN_PASSWORD_LENGTH } from '@/src/lib/auth/credentials'
import { login, signup } from './actions'
import { AuthSubmitButton } from './auth-submit-button'
import { RetniwSymbol } from '@/src/components/app-header'

export const dynamic = 'force-dynamic'

type LoginPageProps = {
  searchParams: Promise<{ error?: string; mode?: string; notice?: string }>
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid: '邮箱或密码不正确。',
  'invalid-email': '请填写可用的邮箱。',
  'invalid-password': `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符。`,
  'password-mismatch': '两次输入的密码不一致。',
  'signup-failed': '没有完成注册，请稍后再试。',
  'confirm-failed': '确认链接已失效，请重新注册或登录。',
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createServerAuthClient()
  const { data } = await supabase.auth.getClaims()

  if (data?.claims?.sub) redirect('/')

  const { error, mode, notice } = await searchParams
  const isSignup = mode === 'signup'

  return (
    <main className="shell">
      <section className="panel panel--compact" aria-labelledby="login-title">
        <p className="login-brand"><RetniwSymbol /><span>retniw</span></p>
        <nav className="auth-mode-switch" aria-label="账号入口">
          <Link href="/login" aria-current={!isSignup ? 'page' : undefined}>登录</Link>
          <Link href="/login?mode=signup" aria-current={isSignup ? 'page' : undefined}>创建账号</Link>
        </nav>
        <h1 id="login-title">{isSignup ? '创建账号' : '登录'}</h1>
        <p className="muted">{isSignup ? '填写邮箱，设置自己的密码。' : '继续之前写下的内容。'}</p>
        {notice === 'check-email' ? (
          <p className="auth-notice" role="status">请查收确认邮件。完成确认后，就可以直接使用。</p>
        ) : null}
        <form action={isSignup ? signup : login} className="login-form">
          <label>
            邮箱
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
              required
            />
          </label>
          {isSignup ? (
            <label>
              再输一次密码
              <input
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </label>
          ) : null}
          {error ? <p className="form-error">{ERROR_MESSAGES[error] ?? '没有完成，请稍后再试。'}</p> : null}
          <AuthSubmitButton isSignup={isSignup} />
        </form>
        <p className="login-note">
          请勿记录工作机密；主动使用 AI 时，当前想法会交给 DeepSeek 处理。
        </p>
      </section>
    </main>
  )
}
