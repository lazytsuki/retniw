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
  revealed: boolean
  onChoose?: () => void
  onConceal: () => void
  onReveal: () => void
  onNavigate: (thoughtId: string) => void
  onAction: (thought: ThoughtSummary, action: ThoughtAction, trigger?: HTMLElement | null) => Promise<void>
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
  revealed,
  onChoose,
  onConceal,
  onReveal,
  onNavigate,
  onAction,
  onMove,
  onCreateCollection,
}: ThoughtListItemProps) {
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const start = useRef<{ x: number; y: number; offset: number } | null>(null)
  const currentOffset = useRef(0)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressOpened = useRef(false)
  const suppressClick = useRef(false)
  const overlay = useOverlayController()
  const menuId = `thought-actions:${menuScope}:${thought.id}`
  const pickerId = `thought-move:${menuScope}:${thought.id}`
  const triggerId = `thought-action-trigger:${menuScope}:${thought.id}`
  const itemOverlayOpen = overlay.activeId === menuId || overlay.activeId === pickerId
  const offset = dragOffset ?? (revealed ? -152 : 0)

  function actionTrigger() {
    return document.getElementById(triggerId) as HTMLButtonElement | null
  }

  function clearLongPress() {
    if (longPress.current) clearTimeout(longPress.current)
    longPress.current = null
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest('.thought-action-menu__trigger')) return
    start.current = { x: event.clientX, y: event.clientY, offset }
    currentOffset.current = offset
    longPressOpened.current = false
    clearLongPress()
    if (event.pointerType === 'mouse') return
    longPress.current = setTimeout(() => {
      suppressClick.current = true
      longPressOpened.current = true
      onConceal()
      setDragOffset(null)
      const trigger = actionTrigger()
      trigger?.focus()
      overlay.open(menuId, trigger)
    }, 450)
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearLongPress()
    if (mode === 'deleted' || Math.abs(dx) <= Math.abs(dy)) return
    const nextOffset = Math.max(-152, Math.min(0, start.current.offset + dx))
    currentOffset.current = nextOffset
    setDragOffset(nextOffset)
  }

  function pointerEnd() {
    clearLongPress()
    start.current = null
    if (longPressOpened.current) {
      longPressOpened.current = false
      setDragOffset(null)
      window.requestAnimationFrame(() => {
        document.getElementById(`${menuId}:panel`)
          ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
          ?.focus({ preventScroll: true })
      })
      return
    }
    if (mode !== 'deleted' && currentOffset.current < -52) onReveal()
    else onConceal()
    setDragOffset(null)
  }

  return (
    <div
      className="thought-list-item"
      data-thought-id={thought.id}
      onContextMenu={(event) => {
        event.preventDefault()
        onConceal()
        const trigger = actionTrigger()
        trigger?.focus()
        overlay.open(menuId, trigger)
      }}
    >
      {mode !== 'deleted' && <div className="thought-list-item__swipe-actions" aria-hidden={offset === 0}>
        {mode === 'active' && <button type="button" disabled={offset === 0} onClick={(event) => void onAction(thought, 'archive', event.currentTarget)}><ArchiveIcon />归档</button>}
        {mode === 'archived' && <button type="button" disabled={offset === 0} onClick={(event) => void onAction(thought, 'unarchive', event.currentTarget)}><ArchiveIcon />取消归档</button>}
        <button className="danger" type="button" disabled={offset === 0} onClick={(event) => void onAction(thought, 'delete', event.currentTarget)}><TrashIcon />删除</button>
      </div>}
      <div
        className={[
          'thought-list-item__surface',
          active ? 'thought-list-item__surface--active' : '',
          navigating ? 'thought-list-item__surface--pending' : '',
        ].filter(Boolean).join(' ')}
        style={{
          transform: `translateX(${offset}px)`,
          transition: itemOverlayOpen ? 'none' : undefined,
        }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
      >
        {mode === 'deleted' ? <button
          className="thought-link thought-link--deleted"
          type="button"
          onClick={(event) => {
            if (suppressClick.current) {
              suppressClick.current = false
              return
            }
            const trigger = actionTrigger()
            trigger?.focus()
            overlay.open(menuId, trigger ?? event.currentTarget)
          }}
        >
          <span>{excerpt(thought)}</span>
          <time dateTime={thought.lastActivityAt}>
            {new Intl.DateTimeFormat('zh-CN', {
              month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai',
            }).format(new Date(thought.lastActivityAt))}
          </time>
        </button> : <Link
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
              onConceal()
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
        </Link>}
        <ThoughtActionMenu
          thought={thought}
          menuScope={menuScope}
          collections={collections}
          mode={mode}
          onOpen={onConceal}
          onAction={(action) => onAction(thought, action)}
          onMove={(collectionId) => onMove(thought, collectionId)}
          onCreateCollection={onCreateCollection}
        />
      </div>
    </div>
  )
}
