'use client'

import Link from 'next/link'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ThoughtSummary } from './thought-workspace'
import type { ThoughtCollection } from '@/src/server/repositories/collection-repository'
import { isMarkdownContent, markdownToPlainText } from '@/src/lib/markdown'
import { ArchiveIcon, TrashIcon, ThoughtActionMenu, type ThoughtAction } from './thought-action-menu'
import { useOverlayController } from '@/src/components/overlay-provider'

function excerpt(thought: ThoughtSummary) {
  if (!thought.firstEntry) return '以前的想法'
  const content = isMarkdownContent(thought.firstEntry.entryType, thought.firstEntry.sourceLabel)
    ? markdownToPlainText(thought.firstEntry.content)
    : thought.firstEntry.content
  return content.trim() || '以前的想法'
}

type ThoughtListItemProps = {
  thought: ThoughtSummary
  menuScope: 'sidebar' | 'history'
  active: boolean
  navigating: boolean
  collections: ThoughtCollection[]
  mode: 'active' | 'archived' | 'deleted'
  onChoose?: () => void
  onNavigate: (thoughtId: string) => void
  onAction: (thought: ThoughtSummary, action: ThoughtAction) => Promise<void>
  onMove: (thought: ThoughtSummary, collectionId: string | null) => Promise<void>
  onCreateCollection: (name: string) => Promise<ThoughtCollection>
}

export function ThoughtListItem({
  thought,
  menuScope,
  active,
  navigating,
  collections,
  mode,
  onChoose,
  onNavigate,
  onAction,
  onMove,
  onCreateCollection,
}: ThoughtListItemProps) {
  const [offset, setOffset] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClick = useRef(false)
  const overlay = useOverlayController()
  const menuId = `thought-actions:${menuScope}:${thought.id}`

  function clearLongPress() {
    if (longPress.current) clearTimeout(longPress.current)
    longPress.current = null
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest('button')) return
    start.current = { x: event.clientX, y: event.clientY }
    clearLongPress()
    if (event.pointerType === 'mouse') return
    longPress.current = setTimeout(() => {
      suppressClick.current = true
      setOffset(0)
      overlay.open(menuId, event.currentTarget)
    }, 450)
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearLongPress()
    if (Math.abs(dx) <= Math.abs(dy)) return
    setOffset(Math.max(-152, Math.min(0, dx)))
  }

  function pointerEnd() {
    clearLongPress()
    start.current = null
    setOffset((current) => current < -52 ? -152 : 0)
  }

  return (
    <div
      className="thought-list-item"
      onContextMenu={(event) => {
        event.preventDefault()
        overlay.open(menuId, event.currentTarget)
      }}
    >
      {mode !== 'deleted' && <div className="thought-list-item__swipe-actions" aria-hidden={offset === 0}>
        {mode === 'active' && <button type="button" disabled={offset === 0} onClick={() => void onAction(thought, 'archive')}><ArchiveIcon />归档</button>}
        {mode === 'archived' && <button type="button" disabled={offset === 0} onClick={() => void onAction(thought, 'unarchive')}>恢复</button>}
        <button className="danger" type="button" disabled={offset === 0} onClick={() => void onAction(thought, 'delete')}><TrashIcon />删除</button>
      </div>}
      <div
        className={[
          'thought-list-item__surface',
          active ? 'thought-list-item__surface--active' : '',
          navigating ? 'thought-list-item__surface--pending' : '',
        ].filter(Boolean).join(' ')}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
      >
        <Link
          aria-current={active ? 'page' : undefined}
          aria-busy={navigating || undefined}
          className={[
            'thought-link',
            active ? 'thought-link--active' : '',
            navigating ? 'thought-link--pending' : '',
          ].filter(Boolean).join(' ')}
          href={`/thoughts/${thought.id}`}
          prefetch={false}
          onClick={(event) => {
            if (suppressClick.current) {
              event.preventDefault()
              suppressClick.current = false
              return
            }
            if (offset !== 0) {
              event.preventDefault()
              setOffset(0)
              return
            }
            if (active) {
              event.preventDefault()
              document.getElementById('current-thought')?.scrollIntoView({ block: 'start' })
            } else {
              onNavigate(thought.id)
            }
            onChoose?.()
          }}
        >
          <span>{excerpt(thought)}</span>
          <time dateTime={thought.lastActivityAt}>
            {navigating
              ? '正在打开'
              : new Intl.DateTimeFormat('zh-CN', {
                  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai',
                }).format(new Date(thought.lastActivityAt))}
          </time>
        </Link>
        <ThoughtActionMenu
          thought={thought}
          menuScope={menuScope}
          collections={collections}
          mode={mode}
          onAction={(action) => onAction(thought, action)}
          onMove={(collectionId) => onMove(thought, collectionId)}
          onCreateCollection={onCreateCollection}
        />
      </div>
    </div>
  )
}
