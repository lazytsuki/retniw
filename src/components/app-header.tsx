import Link from 'next/link'
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

export function AppHeader({ back = false }: { back?: boolean }) {
  return (
    <header className="app-header">
      {back ? (
        <Link className="back-link" href="/" aria-label="返回">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5 8 12l7 7" />
          </svg>
        </Link>
      ) : (
        <span className="header-anchor" aria-hidden="true" />
      )}
      <Link className="brand" href="/">
        <RetniwSymbol />
        <span>retniw</span>
      </Link>
      <form action={logout} className="logout-form">
        <button type="submit">退出</button>
      </form>
    </header>
  )
}
