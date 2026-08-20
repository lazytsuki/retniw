import Link from 'next/link'

function RetniwSymbol() {
  return (
    <svg className="brand-symbol" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7.5 18.5c0-7 4.2-11 9.7-11 4.7 0 7.8 2.9 7.8 6.8 0 5.6-5.4 9.7-11.4 9.7-3 0-5.1-1.2-6.1-3.2" />
      <path d="M7.5 12v6.5H14" />
      <circle cx="20.8" cy="14.3" r="1.4" />
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
      <span className="header-spacer" />
    </header>
  )
}
