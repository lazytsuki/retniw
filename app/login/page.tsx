import { redirect } from 'next/navigation'
import { createServerAuthClient } from '@/src/lib/supabase/server'
import { login } from './actions'

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
        <p className="login-brand">retniw</p>
        <h1 id="login-title">登录</h1>
        <p className="muted">仅限本人使用</p>
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
      </section>
    </main>
  )
}
