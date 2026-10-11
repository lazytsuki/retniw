'use client'

import Link from 'next/link'
import { useEffect } from 'react'

const REDIRECT_DELAY_MS = 1800

export function AccountCreatedTransition() {
  useEffect(() => {
    const timer = window.setTimeout(() => window.location.replace('/'), REDIRECT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main className="shell auth-transition-shell" id="main-content" tabIndex={-1}>
      <section className="panel panel--compact auth-transition" aria-labelledby="auth-transition-title">
        <p className="auth-transition__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7" /></svg>
        </p>
        <h1 id="auth-transition-title">账号建好了</h1>
        <p className="muted" role="status">马上进去。</p>
        <Link href="/">直接进入</Link>
      </section>
    </main>
  )
}
