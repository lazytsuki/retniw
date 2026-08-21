'use client'

import { useRef } from 'react'
import type { Thought } from '@/src/server/repositories/thought-repository'
import type { ThoughtCollection } from '@/src/server/repositories/collection-repository'
import { CollectionPicker } from './collection-picker'
import { useDismissibleLayer, useOverlayController } from '@/src/components/overlay-provider'

export type ThoughtAction = 'archive' | 'unarchive' | 'delete' | 'restore'

type ThoughtActionMenuProps = {
  thought: Thought
  menuScope: 'sidebar' | 'history'
  collections: ThoughtCollection[]
  mode: 'active' | 'archived' | 'deleted'
  onAction: (action: ThoughtAction) => Promise<void>
  onMove: (collectionId: string | null) => Promise<void>
  onCreateCollection: (name: string) => Promise<ThoughtCollection>
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

function RestoreIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8H3V5M4 8a8 8 0 1 1 1 9M12 8v5l3 2" /></svg>
}

export function ThoughtActionMenu({
  thought,
  menuScope,
  collections,
  mode,
  onAction,
  onMove,
  onCreateCollection,
}: ThoughtActionMenuProps) {
  const menuId = `thought-actions:${menuScope}:${thought.id}`
  const pickerId = `thought-move:${menuScope}:${thought.id}`
  const menuRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const overlay = useOverlayController()
  const menuOpen = overlay.isOpen(menuId)
  const pickerOpen = overlay.isOpen(pickerId)
  useDismissibleLayer(menuId, menuRef)
  useDismissibleLayer(pickerId, pickerRef)

  async function run(action: ThoughtAction) {
    overlay.close()
    await onAction(action)
  }

  return (
    <div className="thought-action-menu" ref={menuRef}>
      <button
        className="thought-action-menu__trigger"
        type="button"
        aria-label="想法操作"
        aria-expanded={menuOpen}
        onClick={(event) => menuOpen
          ? overlay.close(menuId)
          : overlay.open(menuId, event.currentTarget)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.25" /><circle cx="12" cy="12" r="1.25" /><circle cx="19" cy="12" r="1.25" />
        </svg>
      </button>
      {menuOpen && (
        <div className="thought-action-menu__panel" role="menu">
          {mode !== 'deleted' && <button type="button" role="menuitem" onClick={() => overlay.open(pickerId)}><MoveIcon />移入</button>}
          {mode === 'active' && <button type="button" role="menuitem" onClick={() => void run('archive')}><ArchiveIcon />归档</button>}
          {mode === 'archived' && <button type="button" role="menuitem" onClick={() => void run('unarchive')}><RestoreIcon />取消归档</button>}
          {mode !== 'deleted' && <button className="thought-action-menu__danger" type="button" role="menuitem" onClick={() => void run('delete')}><TrashIcon />删除</button>}
          {mode === 'deleted' && <button type="button" role="menuitem" onClick={() => void run('restore')}><RestoreIcon />恢复</button>}
        </div>
      )}
      {pickerOpen && (
        <div ref={pickerRef}>
          <CollectionPicker
            collections={collections}
            currentId={thought.collectionId}
            onCreate={onCreateCollection}
            onChoose={async (collectionId) => {
              await onMove(collectionId)
              overlay.close(pickerId)
            }}
          />
        </div>
      )}
    </div>
  )
}

export { ArchiveIcon, TrashIcon }
