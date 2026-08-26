'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Thought } from '@/src/server/repositories/thought-repository'
import type { ThoughtCollection } from '@/src/server/repositories/collection-repository'
import { CollectionPicker } from './collection-picker'
import { useDismissibleLayer, useOverlayController } from '@/src/components/overlay-provider'

export type ThoughtAction = 'archive' | 'unarchive' | 'delete'

type ThoughtActionMenuProps = {
  thought: Thought
  menuScope: 'sidebar' | 'history'
  collections: ThoughtCollection[]
  mode: 'active' | 'archived'
  onAction: (action: ThoughtAction) => Promise<void>
  onMove: (collectionId: string | null) => Promise<void>
  onCreateCollection: (name: string) => Promise<ThoughtCollection>
  onOpen?: () => void
}

function MoveIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v13h-17z" /><path d="m14 10-3 3 3 3M11 13h7" /></svg>
}

function ArchiveIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v4H3zM9 12h6" /></svg>
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>
}

function UnarchiveIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v4H3zM9 14h6M12 17v-6M9.5 13.5 12 11l2.5 2.5" /></svg>
}

export function ThoughtActionMenu({
  thought,
  menuScope,
  collections,
  mode,
  onAction,
  onMove,
  onCreateCollection,
  onOpen,
}: ThoughtActionMenuProps) {
  const menuId = `thought-actions:${menuScope}:${thought.id}`
  const pickerId = `thought-move:${menuScope}:${thought.id}`
  const triggerId = `thought-action-trigger:${menuScope}:${thought.id}`
  const actionTriggerRef = useRef<HTMLButtonElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const movePendingRef = useRef(false)
  const [moveState, setMoveState] = useState<'idle' | 'pending' | 'error'>('idle')
  const overlay = useOverlayController()
  const menuOpen = overlay.isOpen(menuId)
  const pickerOpen = overlay.isOpen(pickerId)
  useDismissibleLayer(menuId, layerRef, actionTriggerRef)
  useDismissibleLayer(pickerId, layerRef, actionTriggerRef)

  useLayoutEffect(() => {
    if (!menuOpen) return
    const frame = window.requestAnimationFrame(() => {
      layerRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
        ?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [menuOpen])

  useLayoutEffect(() => {
    if (!pickerOpen) return
    const frame = window.requestAnimationFrame(() => {
      layerRef.current
        ?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')
        ?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pickerOpen])

  useLayoutEffect(() => {
    if (!menuOpen && !pickerOpen) return
    const place = () => {
      const layer = layerRef.current
      const trigger = actionTriggerRef.current
      if (!layer || !trigger) return
      if (window.matchMedia('(max-width: 900px)').matches) {
        layer.style.removeProperty('left')
        layer.style.removeProperty('top')
        layer.dataset.mobile = 'true'
        layer.dataset.positioned = 'true'
        return
      }

      delete layer.dataset.mobile
      const triggerRect = trigger.getBoundingClientRect()
      const width = layer.offsetWidth
      const height = layer.offsetHeight
      const edge = 8
      const gap = 6
      const left = Math.min(
        Math.max(edge, triggerRect.right - width),
        Math.max(edge, window.innerWidth - width - edge),
      )
      const below = triggerRect.bottom + gap
      const above = triggerRect.top - height - gap
      const preferredTop = below + height <= window.innerHeight - edge
        ? below
        : above
      const top = Math.min(
        Math.max(edge, preferredTop),
        Math.max(edge, window.innerHeight - height - edge),
      )
      layer.style.left = `${left}px`
      layer.style.top = `${top}px`
      layer.dataset.positioned = 'true'
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [actionTriggerRef, menuOpen, pickerOpen])

  async function run(action: ThoughtAction) {
    if (action !== 'delete') overlay.close()
    await onAction(action)
  }

  async function chooseCollection(collectionId: string | null) {
    if (movePendingRef.current) return
    movePendingRef.current = true
    setMoveState('pending')
    try {
      await onMove(collectionId)
      setMoveState('idle')
      overlay.close(pickerId)
    } catch {
      setMoveState('error')
    } finally {
      movePendingRef.current = false
    }
  }

  function navigateMenu(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    )
    if (items.length === 0) return

    event.preventDefault()
    const currentIndex = items.findIndex((item) => item === document.activeElement)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length
    items[nextIndex]?.focus({ preventScroll: true })
  }

  const portalTarget = typeof document === 'undefined'
    ? null
    : menuScope === 'history'
      ? document.getElementById('thought-history-layer-root') ?? document.body
      : document.body
  const actionLayer = menuOpen ? (
    <div
      id={`${menuId}:panel`}
      className="thought-action-menu__panel thought-action-layer__content"
      data-scope={menuScope}
      ref={layerRef}
      role="menu"
      onKeyDown={navigateMenu}
    >
      <button type="button" role="menuitem" onClick={() => {
        setMoveState('idle')
        overlay.open(pickerId)
      }}><MoveIcon />移入</button>
      {mode === 'active' && <button type="button" role="menuitem" onClick={() => void run('archive')}><ArchiveIcon />归档</button>}
      {mode === 'archived' && <button type="button" role="menuitem" onClick={() => void run('unarchive')}><UnarchiveIcon />取消归档</button>}
      <div className="thought-action-menu__danger-group" role="group">
        <button className="thought-action-menu__danger" type="button" role="menuitem" onClick={() => void run('delete')}><TrashIcon />删除</button>
      </div>
    </div>
  ) : pickerOpen ? (
    <div
      id={`${pickerId}:panel`}
      aria-busy={moveState === 'pending' || undefined}
      className="collection-picker-layer thought-action-layer__content"
      data-scope={menuScope}
      ref={layerRef}
    >
      <CollectionPicker
        collections={collections}
        currentId={thought.collectionId}
        onCreate={onCreateCollection}
        onChoose={chooseCollection}
      />
      {moveState === 'pending' && <p className="collection-picker-layer__status" role="status">正在移入</p>}
      {moveState === 'error' && <p className="collection-picker-layer__status collection-picker-layer__status--error" role="alert">没有移入，可以重试。</p>}
    </div>
  ) : null

  return (
    <div className="thought-action-menu">
      <button
        id={triggerId}
        ref={actionTriggerRef}
        className="thought-action-menu__trigger"
        type="button"
        aria-label="想法操作"
        aria-haspopup="menu"
        aria-expanded={menuOpen || pickerOpen}
        aria-controls={menuOpen ? `${menuId}:panel` : pickerOpen ? `${pickerId}:panel` : undefined}
        onClick={(event) => {
          onOpen?.()
          if (menuOpen || pickerOpen) overlay.close()
          else overlay.open(menuId, event.currentTarget)
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.25" /><circle cx="12" cy="12" r="1.25" /><circle cx="19" cy="12" r="1.25" />
        </svg>
      </button>
      {actionLayer && portalTarget && createPortal(actionLayer, portalTarget)}
    </div>
  )
}

export { ArchiveIcon, TrashIcon }
