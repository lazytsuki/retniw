import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SyncStatus } from '@/src/components/thoughts/sync-status'
import type { ThoughtOutboxItem } from '@/src/lib/capture/capture-store'

const baseItem: ThoughtOutboxItem = {
  userId: '018f6f3a-a1c2-47a8-8f1e-100000000099',
  thoughtId: '018f6f3a-a1c2-47a8-8f1e-100000000001',
  entryId: '018f6f3a-a1c2-47a8-8f1e-100000000002',
  clientRequestId: '018f6f3a-a1c2-47a8-8f1e-200000000002',
  content: '本机内容',
  entryType: 'user',
  sourceLabel: null,
  createsThought: false,
  state: 'draft',
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
}

function renderStatus(
  items: ThoughtOutboxItem[],
  { ready = true, syncing = false, hasGlobalFailure = false, legacyItemCount = 0 } = {},
) {
  return renderToStaticMarkup(createElement(SyncStatus, {
    items,
    hasGlobalFailure,
    legacyItemCount,
    ready,
    syncing,
    onRecoverLegacy: vi.fn(async () => undefined),
    onRetry: vi.fn(),
  }))
}

describe('sync status', () => {
  it('does not claim a sync result before the local outbox is ready', () => {
    expect(renderStatus([], { ready: false })).toBe('')
    expect(renderStatus([{ ...baseItem, state: 'failed' }], { ready: false })).toBe('')
  })

  it('shows that a draft is safely stored locally', () => {
    expect(renderStatus([baseItem], { syncing: true })).toContain('已保存在本机')
  })

  it('shows pending work as syncing', () => {
    expect(renderStatus([{ ...baseItem, state: 'pending' }])).toContain('正在同步')
  })

  it('prioritizes a retryable failure over later pending work', () => {
    const markup = renderStatus([
      { ...baseItem, state: 'failed' },
      { ...baseItem, entryId: 'later-entry', state: 'pending' },
    ], { syncing: true })

    expect(markup).toContain('有内容尚未同步，可以重试')
    expect(markup).toContain('>重试</button>')
    expect(markup).not.toContain('正在同步')
  })

  it('surfaces a failure from another thought without showing its unrelated draft', () => {
    const markup = renderStatus([], { hasGlobalFailure: true })

    expect(markup).toContain('有内容尚未同步，可以重试')
    expect(markup).toContain('>重试</button>')
  })

  it('quarantines ownerless legacy content until the signed-in user explicitly claims it', () => {
    const markup = renderStatus([], { legacyItemCount: 2 })

    expect(markup).toContain('发现2段旧版本本机内容')
    expect(markup).toContain('为避免发错账号，已暂停同步')
    expect(markup).toContain('确认属于当前账号并恢复')
  })

  it('stays quiet when the ready outbox has no local items', () => {
    expect(renderStatus([])).toBe('')
  })
})
