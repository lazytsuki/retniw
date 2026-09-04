'use client'

import { useState, type ReactNode } from 'react'
import type { ThoughtOutboxItem } from '@/src/lib/capture/capture-store'

type SyncStatusProps = {
  items: ThoughtOutboxItem[]
  hasGlobalFailure?: boolean
  authContextChanged?: boolean
  legacyItemCount?: number
  ready: boolean
  syncing: boolean
  onRecoverLegacy?: () => Promise<void>
  onRetry: () => void
}

export function SyncStatus({
  items,
  hasGlobalFailure = false,
  authContextChanged = false,
  legacyItemCount = 0,
  ready,
  syncing,
  onRecoverLegacy,
  onRetry,
}: SyncStatusProps) {
  const [legacyRecovery, setLegacyRecovery] = useState<'idle' | 'pending' | 'error'>('idle')
  if (!ready) return null

  const failed = items.filter((item) => item.state === 'failed').length
  const pending = items.filter((item) => item.state === 'pending').length
  const drafts = items.filter((item) => item.state === 'draft').length
  let currentStatus: ReactNode = null

  if (authContextChanged) {
    currentStatus = (
      <div className="sync-status sync-status--failed" role="alert">
        <span>账号已在其他页面切换，未同步内容仍保留在本机。</span>
        <button type="button" onClick={() => window.location.reload()}>刷新后继续</button>
      </div>
    )
  } else if (failed || hasGlobalFailure) {
    currentStatus = (
      <div className="sync-status sync-status--failed" role="status">
        <span>有内容尚未同步，可以重试</span>
        <button type="button" onClick={onRetry}>重试</button>
      </div>
    )
  } else if (items.length && drafts === items.length) {
    currentStatus = <p className="sync-status" role="status">已保存在本机</p>
  } else if (syncing || pending) {
    currentStatus = <p className="sync-status" role="status">正在同步</p>
  }

  return <>
    {legacyItemCount > 0 && onRecoverLegacy ? (
      <div className="sync-status sync-status--legacy" role="status">
        <span>发现{legacyItemCount}段旧版本本机内容。旧版本没有记录所属账号，为避免发错账号，已暂停同步。</span>
        <button
          type="button"
          disabled={legacyRecovery === 'pending'}
          onClick={() => {
            setLegacyRecovery('pending')
            void onRecoverLegacy().catch(() => setLegacyRecovery('error'))
          }}
        >{legacyRecovery === 'pending' ? '正在恢复' : '确认属于当前账号并恢复'}</button>
        {legacyRecovery === 'error' && <span role="alert">没有恢复，可以重试。</span>}
      </div>
    ) : null}
    {currentStatus}
  </>
}
