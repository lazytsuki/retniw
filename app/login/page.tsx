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
  const errorMessage = error ? ERROR_MESSAGES[error] ?? '没有完成，请稍后再试。' : ''

  return (
    <main className="welcome-shell" id="main-content" tabIndex={-1}>
      <section className="welcome-intro" aria-labelledby="welcome-title">
        <p className="login-brand"><RetniwSymbol /><span>retniw</span></p>
        <h1 id="welcome-title">记想法的地方</h1>
        <p className="welcome-description">想到什么就写下来。之后可以接着写，也能搜到以前写过的。</p>
      </section>
      <section className="panel welcome-account" aria-labelledby="login-title">
        <nav className="auth-mode-switch" aria-label="账号入口">
          <Link href="/login" aria-current={!isSignup ? 'page' : undefined}>登录</Link>
          <Link href="/login?mode=signup" aria-current={isSignup ? 'page' : undefined}>创建账号</Link>
        </nav>
        <h2 id="login-title">{isSignup ? '创建账号' : '登录'}</h2>
        {isSignup ? <p className="muted">用邮箱注册，密码自己设。</p> : null}
        {notice === 'check-email' ? (
          <p className="auth-notice" role="status">确认邮件已经发出，点邮件里的链接就能用了。</p>
        ) : null}
        <form action={isSignup ? signup : login} className="login-form">
          <label>
            邮箱
            <input
              name="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'login-error' : undefined}
              required
            />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'login-error' : undefined}
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
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? 'login-error' : undefined}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </label>
          ) : null}
          {error ? <p className="form-error" id="login-error" role="alert">{errorMessage}</p> : null}
          <AuthSubmitButton isSignup={isSignup} />
        </form>
        <p className="login-note">
          内容只有你自己能看到。用 AI 功能时，相关文字会发给 DeepSeek，别写工作机密。
        </p>
      </section>
    </main>
  )
}
