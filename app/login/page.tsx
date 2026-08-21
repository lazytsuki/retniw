import { redirect } from 'next/navigation'
import { createServerAuthClient } from '@/src/lib/supabase/server'
import { login } from './actions'
import { RetniwSymbol } from '@/src/components/app-header'

export const dynamic = 'force-dynamic'

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/')

  const { error } = await searchParams

  return (
    <main className="shell">
      <section className="panel panel--compact" aria-labelledby="login-title">
        <p className="login-brand"><RetniwSymbol /><span>retniw</span></p>
        <h1 id="login-title">登录</h1>
        <p className="muted">邀请内测</p>
        <form action={login} className="login-form">
          <label>
            邮箱
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            密码
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error ? <p className="form-error">邮箱或密码不正确。</p> : null}
          <button type="submit">登录</button>
        </form>
        <p className="login-note">
          每位体验者使用自己的账号。请勿记录工作机密；主动使用 AI 时，当前想法会交给 DeepSeek 处理。
        </p>
      </section>
    </main>
  )
}
