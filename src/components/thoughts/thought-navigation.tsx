'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { ThoughtSummary } from './thought-workspace'
import { isMarkdownContent, markdownToPlainText } from '@/src/lib/markdown'

type ThoughtNavigationProps = {
  activeThoughtId: string
  currentStarted: boolean
  initialNextCursor: string | null
  thoughts: ThoughtSummary[]
  relationRunning: boolean
  onFindRelations: () => void
}

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

function thoughtExcerpt(thought: ThoughtSummary) {
  if (!thought.firstEntry) return '还没有内容'
  const content = isMarkdownContent(thought.firstEntry.entryType, thought.firstEntry.sourceLabel)
    ? markdownToPlainText(thought.firstEntry.content)
    : thought.firstEntry.content
  return content.trim() || '还没有内容'
}

function ThoughtList({
  activeThoughtId,
  loading,
  loadError,
  onChoose,
  onIntent,
  onLoadMore,
  onNavigate,
  thoughts,
  hasMore,
  navigatingThoughtId,
}: {
  activeThoughtId: string
  loading: boolean
  loadError: string
  onChoose?: () => void
  onIntent: (thoughtId: string) => void
  onLoadMore: () => void
  onNavigate: (thoughtId: string) => void
  thoughts: ThoughtSummary[]
  hasMore: boolean
  navigatingThoughtId: string | null
}) {
  if (thoughts.length === 0) {
    return <p className="thought-list-empty">还没有以前的想法。</p>
  }

  return (
    <>
      <div className="thought-list">
        {thoughts.map((thought) => (
          <Link
            aria-current={thought.id === activeThoughtId ? 'page' : undefined}
            aria-busy={thought.id === navigatingThoughtId || undefined}
            className={[
              'thought-link',
              thought.id === activeThoughtId ? 'thought-link--active' : '',
              thought.id === navigatingThoughtId ? 'thought-link--pending' : '',
            ].filter(Boolean).join(' ')}
            href={`/thoughts/${thought.id}`}
            key={thought.id}
            prefetch={false}
            onClick={(event) => {
              if (thought.id === activeThoughtId) {
                event.preventDefault()
                document.getElementById('current-thought')?.scrollIntoView({ block: 'start' })
              } else {
                onNavigate(thought.id)
              }
              onChoose?.()
            }}
            onFocus={() => onIntent(thought.id)}
            onPointerEnter={() => onIntent(thought.id)}
          >
            <span>{thoughtExcerpt(thought)}</span>
            <time dateTime={thought.lastActivityAt}>
              {thought.id === navigatingThoughtId
                ? '正在打开'
                : new Intl.DateTimeFormat('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Shanghai',
                  }).format(new Date(thought.lastActivityAt))}
            </time>
          </Link>
        ))}
      </div>
      {loadError && <p className="thought-list-error" role="status">{loadError}</p>}
      {hasMore && (
        <button className="load-more-thoughts" type="button" disabled={loading} onClick={onLoadMore}>
          {loading ? '正在加载' : '加载更多'}
        </button>
      )}
    </>
  )
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
  const [historyOpen, setHistoryOpen] = useState(false)
  const [additionalThoughts, setAdditionalThoughts] = useState<ThoughtSummary[]>([])
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [navigatingThoughtId, setNavigatingThoughtId] = useState<string | null>(null)
  const [navigatingNew, setNavigatingNew] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const allThoughts = useMemo(
    () => mergeThoughts(thoughts, additionalThoughts),
    [additionalThoughts, thoughts],
  )
  const canFindRelations = currentStarted && allThoughts.length > 1

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (historyOpen && !dialog.open) dialog.showModal()
    if (!historyOpen && dialog.open) dialog.close()
  }, [historyOpen])

  function prepareThought(thoughtId: string) {
    if (thoughtId !== activeThoughtId) router.prefetch(`/thoughts/${thoughtId}`)
  }

  function openNewThought(event: MouseEvent<HTMLAnchorElement>) {
    if (!currentStarted) {
      event.preventDefault()
      setHistoryOpen(false)
      document.querySelector<HTMLTextAreaElement>('.thought-composer textarea')?.focus()
      return
    }
    markExplicitNewThought()
    setNavigatingNew(true)
  }

  async function loadMore() {
    if (!nextCursor || loading) return
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch(`/api/thoughts?cursor=${encodeURIComponent(nextCursor)}`)
      const payload = (await response.json().catch(() => null)) as
        | { data?: { thoughts?: ThoughtSummary[]; nextCursor?: string | null } }
        | null
      if (!response.ok || !payload?.data?.thoughts) throw new Error('LOAD_FAILED')
      setAdditionalThoughts((current) => mergeThoughts(current, payload.data!.thoughts!))
      setNextCursor(payload.data.nextCursor ?? null)
    } catch {
      setLoadError('没有加载完成，可以重试。')
    } finally {
      setLoading(false)
    }
  }

  const list = (
    <ThoughtList
      activeThoughtId={activeThoughtId}
      hasMore={Boolean(nextCursor)}
      loading={loading}
      loadError={loadError}
      onChoose={() => setHistoryOpen(false)}
      onIntent={prepareThought}
      onLoadMore={() => void loadMore()}
      onNavigate={setNavigatingThoughtId}
      thoughts={allThoughts}
      navigatingThoughtId={navigatingThoughtId}
    />
  )

  return (
    <>
      <aside className="thought-sidebar" aria-label="想法导航">
        <Link
          aria-current={!currentStarted ? 'page' : undefined}
          aria-busy={navigatingNew || undefined}
          className="new-thought-action"
          href="/"
          onClick={openNewThought}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          <span>
            <strong>{navigatingNew ? '正在打开' : '写新想法'}</strong>
          </span>
        </Link>
        <section className="all-thoughts" aria-labelledby="all-thoughts-title">
          <h2 id="all-thoughts-title">以前的想法</h2>
          {list}
          {canFindRelations && (
            <button
              className="relation-entry"
              type="button"
              disabled={relationRunning}
              onClick={onFindRelations}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="6" cy="8" r="2.5" />
                <circle cx="18" cy="16" r="2.5" />
                <path d="M8.4 9.2 15.6 14.8" />
              </svg>
              {relationRunning ? '正在找联系' : '看看有没有联系'}
            </button>
          )}
        </section>
      </aside>

      <nav className="mobile-workspace-nav" aria-label="想法导航">
        <Link
          aria-current={!currentStarted ? 'page' : undefined}
          aria-busy={navigatingNew || undefined}
          href="/"
          onClick={openNewThought}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          <span>{navigatingNew ? '正在打开' : '写新想法'}</span>
        </Link>
        <button type="button" onClick={() => setHistoryOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 7.5h12M6 12h12M6 16.5h8" />
          </svg>
          <span>以前的想法</span>
        </button>
      </nav>

      <dialog
        className="thought-history-dialog"
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault()
          setHistoryOpen(false)
        }}
        onClose={() => setHistoryOpen(false)}
      >
        <div className="thought-history-dialog__header">
          <h2>以前的想法</h2>
          <button type="button" onClick={() => setHistoryOpen(false)}>关闭</button>
        </div>
        <div className="thought-history-dialog__body">
          {list}
          {canFindRelations && (
            <button
              className="relation-entry"
              type="button"
              disabled={relationRunning}
              onClick={() => {
                setHistoryOpen(false)
                onFindRelations()
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="6" cy="8" r="2.5" />
                <circle cx="18" cy="16" r="2.5" />
                <path d="M8.4 9.2 15.6 14.8" />
              </svg>
              {relationRunning ? '正在找联系' : '看看有没有联系'}
            </button>
          )}
        </div>
      </dialog>
    </>
  )
}
