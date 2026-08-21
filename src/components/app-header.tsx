'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { logout } from '@/app/auth/actions'
import { useDismissibleLayer, useOverlayController } from './overlay-provider'

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
  const menuRef = useRef<HTMLDivElement>(null)
  const overlay = useOverlayController()
  const menuOpen = overlay.isOpen('account')
  useDismissibleLayer('account', menuRef)

  return (
    <header className="app-header">
      <span className="brand">
        <RetniwSymbol />
        <span>retniw</span>
      </span>
      <div className="account-menu" ref={menuRef}>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={(event) => menuOpen
            ? overlay.close('account')
            : overlay.open('account', event.currentTarget)}
        >账号</button>
        {menuOpen && <div className="account-menu__panel" role="menu">
          <form action={logout}>
            <button type="submit" role="menuitem">退出登录</button>
          </form>
        </div>}
      </div>
    </header>
  )
}
