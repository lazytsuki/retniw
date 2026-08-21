'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { ThoughtSummary } from './thought-workspace'
import type { ThoughtCollection } from '@/src/server/repositories/collection-repository'
import { ThoughtListItem } from './thought-list-item'
import type { ThoughtAction } from './thought-action-menu'
import { useOverlayController } from '@/src/components/overlay-provider'

type ThoughtNavigationProps = {
  activeThoughtId: string
  currentStarted: boolean
  initialNextCursor: string | null
  thoughts: ThoughtSummary[]
  relationRunning: boolean
  onFindRelations: () => void
}

type View = { kind: 'recent' | 'archived' | 'deleted' } | { kind: 'collection'; id: string; name: string }

const explicitNewThoughtKey = 'retniw:explicit-new-thought'

function markExplicitNewThought() {
  try {
    sessionStorage.setItem(explicitNewThoughtKey, '1')
  } catch {
    // Navigation still works when browser storage is unavailable.
  }
}

export function mergeThoughts(primary: ThoughtSummary[], additional: ThoughtSummary[]) {
  const merged = new Map<string, ThoughtSummary>()
  for (const thought of [...primary, ...additional]) {
    if (!merged.has(thought.id)) merged.set(thought.id, thought)
  }
  return Array.from(merged.values()).sort(
    (left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt),
  )
}

function viewTitle(view: View) {
  if (view.kind === 'collection') return view.name
  if (view.kind === 'archived') return '归档'
  if (view.kind === 'deleted') return '已删除'
  return '以前的想法'
}

export function ThoughtNavigation({
  activeThoughtId,
  currentStarted,
  initialNextCursor,
  thoughts,
  relationRunning,
  onFindRelations,
}: ThoughtNavigationProps) {
  const router = useRouter()
  const overlay = useOverlayController()
  const historyOpen = overlay.isOpen('history')
    || overlay.activeId?.startsWith('thought-actions:history:') === true
    || overlay.activeId?.startsWith('thought-move:history:') === true
  const deleteOpen = overlay.isOpen('delete-confirm')
  const [view, setView] = useState<View>({ kind: 'recent' })
  const [additionalThoughts, setAdditionalThoughts] = useState<ThoughtSummary[]>([])
  const [viewThoughts, setViewThoughts] = useState<ThoughtSummary[]>([])
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [collectionOverrides, setCollectionOverrides] = useState<Map<string, string | null>>(new Map())
  const [collections, setCollections] = useState<ThoughtCollection[]>([])
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [navigatingThoughtId, setNavigatingThoughtId] = useState<string | null>(null)
  const [navigatingNew, setNavigatingNew] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ThoughtSummary | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const deleteDialogRef = useRef<HTMLDialogElement>(null)
  const recentThoughts = useMemo(
    () => mergeThoughts(thoughts, additionalThoughts).filter((thought) => !removedIds.has(thought.id)),
    [additionalThoughts, removedIds, thoughts],
  )
  const visibleThoughts = (view.kind === 'recent' ? recentThoughts : viewThoughts)
    .filter((thought) => !removedIds.has(thought.id))
    .map((thought) => collectionOverrides.has(thought.id)
      ? { ...thought, collectionId: collectionOverrides.get(thought.id) ?? null }
      : thought)
  const canFindRelations = currentStarted && recentThoughts.length > 1

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (historyOpen && !dialog.open) dialog.showModal()
    if (!historyOpen && dialog.open) dialog.close()
  }, [historyOpen])

  useEffect(() => {
    const dialog = deleteDialogRef.current
    if (!dialog) return
    if (deleteOpen && !dialog.open) dialog.showModal()
    if (!deleteOpen && dialog.open) dialog.close()
  }, [deleteOpen])

  useEffect(() => {
    void fetch('/api/collections')
      .then(async (response) => {
        const payload = await response.json() as { data?: { collections?: ThoughtCollection[] } }
        if (response.ok) setCollections(payload.data?.collections ?? [])
      })
      .catch(() => undefined)
  }, [])

  function openNewThought(event: MouseEvent<HTMLAnchorElement>) {
    if (!currentStarted) {
      event.preventDefault()
      overlay.close()
      document.querySelector<HTMLTextAreaElement>('.thought-composer textarea')?.focus()
      return
    }
    markExplicitNewThought()
    setNavigatingNew(true)
  }

  function queryFor(nextView: View, cursor?: string | null) {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (nextView.kind === 'archived') params.set('scope', 'archived')
    if (nextView.kind === 'deleted') params.set('scope', 'deleted')
    if (nextView.kind === 'collection') params.set('collectionId', nextView.id)
    return `/api/thoughts?${params.toString()}`
  }

  async function loadView(nextView: View) {
    setView(nextView)
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch(queryFor(nextView))
      const payload = await response.json() as { data?: { thoughts?: ThoughtSummary[]; nextCursor?: string | null } }
      if (!response.ok || !payload.data?.thoughts) throw new Error('LOAD_FAILED')
      setViewThoughts(payload.data.thoughts)
      setNextCursor(payload.data.nextCursor ?? null)
      setRemovedIds(new Set())
    } catch {
      setLoadError('没有加载完成，可以重试。')
      setViewThoughts([])
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!nextCursor || loading) return
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch(queryFor(view, nextCursor))
      const payload = await response.json() as { data?: { thoughts?: ThoughtSummary[]; nextCursor?: string | null } }
      if (!response.ok || !payload.data?.thoughts) throw new Error('LOAD_FAILED')
      if (view.kind === 'recent') {
        setAdditionalThoughts((current) => mergeThoughts(current, payload.data!.thoughts!))
      } else {
        setViewThoughts((current) => mergeThoughts(current, payload.data!.thoughts!))
      }
      setNextCursor(payload.data.nextCursor ?? null)
    } catch {
      setLoadError('没有加载完成，可以重试。')
    } finally {
      setLoading(false)
    }
  }

  async function performAction(thought: ThoughtSummary, action: ThoughtAction) {
    setRemovedIds((current) => new Set(current).add(thought.id))
    setLoadError('')
    try {
      const response = await fetch(`/api/thoughts/${thought.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!response.ok) throw new Error('ACTION_FAILED')
      if (action === 'delete' && thought.id === activeThoughtId) router.push('/')
    } catch {
      setRemovedIds((current) => {
        const next = new Set(current)
        next.delete(thought.id)
        return next
      })
      setLoadError('没有完成，可以重试。')
    }
  }

  async function requestAction(thought: ThoughtSummary, action: ThoughtAction) {
    if (action === 'delete') {
      setPendingDelete(thought)
      overlay.open('delete-confirm')
      return
    }
    await performAction(thought, action)
  }

  async function moveThought(thought: ThoughtSummary, collectionId: string | null) {
    const response = await fetch(`/api/thoughts/${thought.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'move', collectionId }),
    })
    if (!response.ok) throw new Error('MOVE_FAILED')
    setCollectionOverrides((current) => new Map(current).set(thought.id, collectionId))
    const patchThought = (item: ThoughtSummary): ThoughtSummary => (
      item.id === thought.id ? { ...item, collectionId } : item
    )
    setAdditionalThoughts((current) => current.map(patchThought))
    setViewThoughts((current) => current.map(patchThought))
    if (view.kind === 'collection' && collectionId !== view.id) {
      setRemovedIds((current) => new Set(current).add(thought.id))
    }
  }

  async function createCollection(name: string) {
    const response = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: crypto.randomUUID(), name }),
    })
    const payload = await response.json() as { data?: { collection?: ThoughtCollection } }
    if (!response.ok || !payload.data?.collection) throw new Error('CREATE_FAILED')
    setCollections((current) => [...current, payload.data!.collection!])
    return payload.data.collection
  }

  function navigationContent(menuScope: 'sidebar' | 'history') {
    const list = visibleThoughts.length === 0
      ? <p className="thought-list-empty">这里还没有想法。</p>
      : <div className="thought-list">
          {visibleThoughts.map((thought) => (
            <ThoughtListItem
              active={thought.id === activeThoughtId}
              collections={collections}
              key={thought.id}
              menuScope={menuScope}
              mode={view.kind === 'archived' ? 'archived' : view.kind === 'deleted' ? 'deleted' : 'active'}
              navigating={thought.id === navigatingThoughtId}
              thought={thought}
              onAction={requestAction}
              onChoose={() => menuScope === 'history' && overlay.close()}
              onCreateCollection={createCollection}
              onMove={moveThought}
              onNavigate={setNavigatingThoughtId}
            />
          ))}
        </div>

    return <>
      <div className="thought-navigation__heading">
        {view.kind !== 'recent' && <button type="button" onClick={() => {
          setView({ kind: 'recent' })
          setNextCursor(initialNextCursor)
          setRemovedIds(new Set())
        }}>全部</button>}
        <h2>{viewTitle(view)}</h2>
      </div>
      {list}
      {loadError && <p className="thought-list-error" role="status">{loadError}</p>}
      {nextCursor && <button className="load-more-thoughts" type="button" disabled={loading} onClick={() => void loadMore()}>{loading ? '正在加载' : '加载更多'}</button>}
      {view.kind === 'recent' && <div className="thought-navigation__sections">
        {collections.length > 0 && <section>
          <h3>合集</h3>
          {collections.map((collection) => (
            <div className="collection-link" key={collection.id}>
              <button type="button" onClick={() => void loadView({ kind: 'collection', id: collection.id, name: collection.name })}>{collection.name}</button>
              <button
                type="button"
                aria-label={`删除合集 ${collection.name}`}
                onClick={async () => {
                  const response = await fetch(`/api/collections/${collection.id}`, { method: 'DELETE' })
                  if (!response.ok) return setLoadError('没有完成，可以重试。')
                  setCollections((current) => current.filter((item) => item.id !== collection.id))
                  setCollectionOverrides((current) => {
                    const next = new Map(current)
                    for (const thought of [...recentThoughts, ...viewThoughts]) {
                      const currentCollection = next.has(thought.id)
                        ? next.get(thought.id)
                        : thought.collectionId
                      if (currentCollection === collection.id) next.set(thought.id, null)
                    }
                    return next
                  })
                }}
              >×</button>
            </div>
          ))}
        </section>}
        <button type="button" onClick={() => void loadView({ kind: 'archived' })}>归档</button>
        <button type="button" onClick={() => void loadView({ kind: 'deleted' })}>已删除</button>
      </div>}
      {view.kind === 'recent' && canFindRelations && (
        <button className="relation-entry" type="button" disabled={relationRunning} onClick={onFindRelations}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="8" r="2.5" /><circle cx="18" cy="16" r="2.5" /><path d="M8.4 9.2 15.6 14.8" /></svg>
          {relationRunning ? '正在找联系' : '看看有没有联系'}
        </button>
      )}
    </>
  }

  return (
    <>
      <aside className="thought-sidebar" aria-label="想法导航">
        <Link aria-current={!currentStarted ? 'page' : undefined} aria-busy={navigatingNew || undefined} className="new-thought-action" href="/" onClick={openNewThought}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></svg>
          <span><strong>{navigatingNew ? '正在打开' : '写新想法'}</strong></span>
        </Link>
        <section className="all-thoughts">{navigationContent('sidebar')}</section>
      </aside>

      <nav className="mobile-workspace-nav" aria-label="想法导航">
        <Link aria-current={!currentStarted ? 'page' : undefined} aria-busy={navigatingNew || undefined} href="/" onClick={openNewThought}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></svg>
          <span>{navigatingNew ? '正在打开' : '写新想法'}</span>
        </Link>
        <button type="button" onClick={(event) => overlay.open('history', event.currentTarget)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7.5h12M6 12h12M6 16.5h8" /></svg>
          <span>以前的想法</span>
        </button>
      </nav>

      <dialog
        className="thought-history-dialog"
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) overlay.close('history')
        }}
        onCancel={(event) => { event.preventDefault(); overlay.close('history') }}
        onClose={() => historyOpen && overlay.close('history')}
      >
        <div className="thought-history-dialog__header"><h2>以前的想法</h2><button type="button" onClick={() => overlay.close('history')}>关闭</button></div>
        <div className="thought-history-dialog__body">{navigationContent('history')}</div>
      </dialog>

      <dialog
        className="confirm-dialog"
        ref={deleteDialogRef}
        onClick={(event) => { if (event.target === event.currentTarget) overlay.close('delete-confirm') }}
        onCancel={(event) => { event.preventDefault(); overlay.close('delete-confirm') }}
        onClose={() => deleteOpen && overlay.close('delete-confirm')}
      >
        <h2>删除这个想法？</h2>
        <p>之后可以在“已删除”中恢复。</p>
        <div>
          <button type="button" onClick={() => overlay.close('delete-confirm')}>取消</button>
          <button className="danger" type="button" onClick={async () => {
            const thought = pendingDelete
            overlay.close('delete-confirm')
            setPendingDelete(null)
            if (thought) await performAction(thought, 'delete')
          }}>删除</button>
        </div>
      </dialog>
    </>
  )
}
