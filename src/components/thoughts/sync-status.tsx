'use client'

import type { ThoughtOutboxItem } from '@/src/lib/capture/capture-store'

type SyncStatusProps = {
  items: ThoughtOutboxItem[]
  syncing: boolean
  onRetry: () => void
}

export function SyncStatus({ items, syncing, onRetry }: SyncStatusProps) {
  const failed = items.filter((item) => item.state === 'failed').length
  const pending = items.filter((item) => item.state === 'pending').length

  if (failed) {
    return (
      <div className="sync-status sync-status--failed" role="status">
        <span>{failed} 段尚未同步，内容已保留在本机</span>
        <button type="button" onClick={onRetry}>重试</button>
      </div>
    )
  }

  if (syncing || pending) {
    return <p className="sync-status" role="status">正在同步 {pending || 1} 段</p>
  }

  return <p className="sync-status" role="status">已同步</p>
}
