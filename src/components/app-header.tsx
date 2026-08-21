import Image from 'next/image'
import { logout } from '@/app/auth/actions'

export function RetniwSymbol() {
  return (
    <Image
      className="brand-symbol"
      src="/curry-dog-avatar.png"
      width={32}
      height={32}
      alt=""
      unoptimized
    />
  )
}

export function AppHeader() {
  return (
    <header className="app-header">
      <span className="brand">
        <RetniwSymbol />
        <span>retniw</span>
      </span>
      <details className="account-menu">
        <summary>账号</summary>
        <div className="account-menu__panel">
          <form action={logout}>
            <button type="submit">退出登录</button>
          </form>
        </div>
      </details>
    </header>
  )
}
