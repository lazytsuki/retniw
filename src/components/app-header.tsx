'use client'

import Image from 'next/image'
import { useActionState, useRef } from 'react'
import type { MouseEvent } from 'react'
import { updateNickname, type NicknameActionState } from '@/app/account/actions'
import { logout } from '@/app/auth/actions'
import type { AccountProfile } from '@/src/lib/auth/account-profile'
import { useDismissibleLayer, useOverlayController } from './overlay-provider'
import { useWorkspaceSidebar } from './workspace-sidebar-provider'

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

function SidebarIcon({ direction }: { direction: 'collapse' | 'expand' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M9 4v16" />
      {direction === 'expand'
        ? <path d="m13 9 3 3-3 3" />
        : <path d="m16 9-3 3 3 3" />}
    </svg>
  )
}

export function AppHeader({ account }: { account?: AccountProfile }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const collapseRef = useRef<HTMLButtonElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  const overlay = useOverlayController()
  const sidebar = useWorkspaceSidebar()
  const menuOpen = overlay.isOpen('account')
  const initialNicknameState: NicknameActionState = {
    status: 'idle',
    message: '',
    nickname: account?.nickname ?? null,
  }
  const [nicknameState, nicknameAction, nicknamePending] = useActionState(
    updateNickname,
    initialNicknameState,
  )
  const currentNickname = nicknameState.status === 'idle'
    ? account?.nickname ?? null
    : nicknameState.nickname
  const accountLabel = currentNickname || account?.email || '账号'
  useDismissibleLayer('account', menuRef)

  function collapseSidebar(event: MouseEvent<HTMLButtonElement>) {
    overlay.close()
    sidebar.collapse()
    if (event.detail === 0) window.requestAnimationFrame(() => expandRef.current?.focus())
  }

  function expandSidebar(event: MouseEvent<HTMLButtonElement>) {
    sidebar.expand()
    if (event.detail === 0) window.requestAnimationFrame(() => collapseRef.current?.focus())
  }

  return (
    <header className={`app-header${sidebar.collapsed ? ' app-header--sidebar-collapsed' : ''}`}>
      <div className="app-header__sidebar">
        <div className="desktop-sidebar-brand">
          <span className="brand">
            <RetniwSymbol />
            <span>retniw</span>
          </span>
          <button
            ref={collapseRef}
            className="sidebar-collapse-action"
            type="button"
            aria-controls="thought-sidebar"
            aria-expanded="true"
            aria-label="收起侧边栏"
            data-sidebar-tooltip="收起侧边栏"
            onClick={collapseSidebar}
          >
            <SidebarIcon direction="collapse" />
          </button>
        </div>
        <button
          ref={expandRef}
          className="sidebar-expand-action"
          type="button"
          aria-controls="thought-sidebar"
          aria-expanded="false"
          aria-label="展开侧边栏"
          data-sidebar-tooltip="展开侧边栏"
          onClick={expandSidebar}
        >
          <span className="sidebar-expand-action__logo"><RetniwSymbol /></span>
          <span className="sidebar-expand-action__icon"><SidebarIcon direction="expand" /></span>
        </button>
        <span className="brand mobile-app-brand">
          <RetniwSymbol />
          <span>retniw</span>
        </span>
      </div>
      <div className="account-menu" ref={menuRef}>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          aria-label={`账户：${accountLabel}`}
          title={accountLabel}
          onClick={(event) => menuOpen
            ? overlay.close('account')
            : overlay.open('account', event.currentTarget)}
        >{accountLabel}</button>
        {menuOpen && <div className="account-menu__panel" role="dialog" aria-label="账户设置">
          <div className="account-menu__identity">
            <span>当前账号</span>
            <strong className="account-menu__email">{account?.email ?? '未提供邮箱'}</strong>
          </div>
          <form action={nicknameAction} className="account-menu__nickname-form">
            <label htmlFor="account-nickname">昵称</label>
            <div className="account-menu__nickname-row">
              <input
                key={currentNickname ?? ''}
                id="account-nickname"
                className="account-menu__input"
                name="nickname"
                type="text"
                autoComplete="nickname"
                defaultValue={currentNickname ?? ''}
                placeholder="怎么称呼你"
                aria-describedby="account-nickname-help"
              />
              <button type="submit" disabled={nicknamePending} aria-busy={nicknamePending}>
                {nicknamePending ? '保存中' : '保存'}
              </button>
            </div>
            <p id="account-nickname-help" className="account-menu__hint">最多24个字符，留空即清除。</p>
            {nicknameState.message ? (
              <p
                id="account-nickname-feedback"
                className={`account-menu__feedback account-menu__feedback--${nicknameState.status}`}
                role={nicknameState.status === 'error' ? 'alert' : 'status'}
              >{nicknameState.message}</p>
            ) : null}
          </form>
          <form action={logout}>
            <button type="submit">退出登录</button>
          </form>
        </div>}
      </div>
    </header>
  )
}
