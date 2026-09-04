'use client'

import { useEffect, useState } from 'react'
import { authContextChangedEvent } from '@/src/lib/auth/user-bound-fetch'

export function AuthContextNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const show = () => setVisible(true)
    window.addEventListener(authContextChangedEvent, show)
    return () => window.removeEventListener(authContextChangedEvent, show)
  }, [])

  if (!visible) return null

  return (
    <div className="auth-context-notice" role="alert">
      <span>账号已在其他页面切换，请刷新后继续。</span>
      <button type="button" onClick={() => window.location.reload()}>刷新页面</button>
    </div>
  )
}
