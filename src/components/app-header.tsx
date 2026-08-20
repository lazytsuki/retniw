import Link from 'next/link'
import { logout } from '@/app/auth/actions'

export function RetniwSymbol() {
  return (
    <svg className="brand-symbol" viewBox="0 0 32 32" aria-hidden="true">
      <path className="brand-symbol__head" d="M10.2 16c-.45.8-.65 1.7-.65 2.7 0 4.2 2.3 6.4 6.45 6.4s6.45-2.2 6.45-6.4c0-1-.2-1.9-.65-2.7" />
      <path className="brand-symbol__head" d="M10.4 13.8c-1.8 1.7-5.3 1.8-7.1-.2-1.9-2.2-.7-5.2 2-6.8 2.4-1.4 4.9-.8 6.7.6 1.1-.7 2.4-1.1 4-1.1s2.9.4 4 1.1c1.8-1.4 4.3-2 6.7-.6 2.7 1.6 3.9 4.6 2 6.8-1.8 2-5.3 1.9-7.1.2" />
      <path className="brand-symbol__brow" d="m11.1 14.8 2-.5m7.8.5-2-.5" />
      <ellipse className="brand-symbol__eye" cx="12.6" cy="17.5" rx="1.25" ry="1.75" />
      <ellipse className="brand-symbol__eye" cx="19.4" cy="17.5" rx="1.25" ry="1.75" />
      <path className="brand-symbol__lid" d="M11.55 16.75c.55-.55 1.55-.55 2.1 0m4.7 0c.55-.55 1.55-.55 2.1 0" />
      <circle className="brand-symbol__nose" cx="16" cy="20.5" r=".65" />
      <path className="brand-symbol__mouth" d="M15.8 22.4c.4-.35.8-.35 1.2 0" />
    </svg>
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
