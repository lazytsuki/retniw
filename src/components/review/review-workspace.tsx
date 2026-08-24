'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import styles from './review-workspace.module.css'

type ReviewPreference = {
  enabled: boolean
  updatedAt: string | null
}

type ReviewConnection = {
  id: string
  status: 'pending' | 'confirmed'
  source: { thoughtId: string; entryId: string; excerpt: string }
  target: { thoughtId: string; entryId: string; excerpt: string }
  rationale: string
  decidedAt: string | null
  createdAt: string
}

type ReviewResponse = {
  data?: {
    preference?: ReviewPreference
    connections?: ReviewConnection[]
    pendingCount?: number
    nextCursor?: string | null
  }
}

type ListState = {
  items: ReviewConnection[]
  nextCursor: string | null
}

const emptyList: ListState = { items: [], nextCursor: null }

function mergeConnections(current: ReviewConnection[], additional: ReviewConnection[]) {
  const merged = new Map(current.map((item) => [item.id, item]))
  for (const item of additional) merged.set(item.id, item)
  return Array.from(merged.values()).sort((left, right) => (
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
  ))
}

async function readList(status: 'pending' | 'confirmed', cursor?: string | null) {
  const params = new URLSearchParams({ status })
  if (cursor) params.set('cursor', cursor)
  const response = await fetch(`/api/review?${params.toString()}`)
  const payload = await response.json().catch(() => null) as ReviewResponse | null
  if (!response.ok || !payload?.data?.preference || !payload.data.connections) {
    throw new Error('LOAD_FAILED')
  }
  return payload.data
}

function ConnectionMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="8" r="2.5" />
      <circle cx="18" cy="16" r="2.5" />
      <path d="M8.4 9.2 15.6 14.8" />
    </svg>
  )
}

function ArrowMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 16 16 8M10 8h6v6" />
    </svg>
  )
}

function ConnectionCard({
  connection,
  deciding,
  onDecide,
}: {
  connection: ReviewConnection
  deciding: boolean
  onDecide?: (decision: 'confirmed' | 'rejected') => void
}) {
  return (
    <article className={styles.card}>
      <p className={styles.reason}><ConnectionMark />{connection.rationale}</p>
      <div className={styles.pair}>
        <div>
          <span>这次写的</span>
          <p>{connection.source.excerpt}</p>
          <Link href={`/thoughts/${connection.source.thoughtId}#entry-${connection.source.entryId}`}>
            打开原文<ArrowMark />
          </Link>
        </div>
        <div>
          <span>以前写的</span>
          <p>{connection.target.excerpt}</p>
          <Link href={`/thoughts/${connection.target.thoughtId}#entry-${connection.target.entryId}`}>
            打开原文<ArrowMark />
          </Link>
        </div>
      </div>
      {onDecide ? (
        <div className={styles.actions}>
          <button type="button" disabled={deciding} onClick={() => onDecide('confirmed')}>
            {deciding ? '正在保存' : '保留'}
          </button>
          <button type="button" disabled={deciding} onClick={() => onDecide('rejected')}>忽略</button>
        </div>
      ) : null}
    </article>
  )
}

export function ReviewWorkspace() {
  const [preference, setPreference] = useState<ReviewPreference | null>(null)
  const [pending, setPending] = useState<ListState>(emptyList)
  const [confirmed, setConfirmed] = useState<ListState>(emptyList)
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState<'pending' | 'confirmed' | null>(null)
  const [preferencePending, setPreferencePending] = useState(false)
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const [pendingData, confirmedData] = await Promise.all([
        readList('pending'),
        readList('confirmed'),
      ])
      setPreference(pendingData.preference!)
      setPending({
        items: pendingData.connections!,
        nextCursor: pendingData.nextCursor ?? null,
      })
      setPendingCount(pendingData.pendingCount ?? pendingData.connections!.length)
      setConfirmed({
        items: confirmedData.connections!,
        nextCursor: confirmedData.nextCursor ?? null,
      })
    } catch {
      setMessage('没有加载完成，可以重试。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  async function setEnabled(enabled: boolean) {
    if (!preference || preferencePending) return
    const previous = preference
    setPreference({ ...preference, enabled })
    setPreferencePending(true)
    setMessage('')
    try {
      const response = await fetch('/api/review/preference', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const payload = await response.json().catch(() => null) as ReviewResponse | null
      if (!response.ok || !payload?.data?.preference) throw new Error('UPDATE_FAILED')
      setPreference(payload.data.preference)
    } catch {
      setPreference(previous)
      setMessage('没有保存，可以重试。')
    } finally {
      setPreferencePending(false)
    }
  }

  async function decide(connection: ReviewConnection, decision: 'confirmed' | 'rejected') {
    if (decidingId) return
    const previousPending = pending
    const previousPendingCount = pendingCount
    setDecidingId(connection.id)
    setMessage('')
    setPending((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== connection.id),
    }))
    setPendingCount((current) => Math.max(0, current - 1))
    try {
      const response = await fetch(`/api/thought-connections/${connection.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (!response.ok) throw new Error('DECIDE_FAILED')
      if (decision === 'confirmed') {
        const data = await readList('confirmed')
        setConfirmed({ items: data.connections!, nextCursor: data.nextCursor ?? null })
      }
    } catch {
      setPending(previousPending)
      setPendingCount(previousPendingCount)
      setMessage('没有保存，可以重试。')
    } finally {
      setDecidingId(null)
    }
  }

  async function loadMore(status: 'pending' | 'confirmed') {
    const state = status === 'pending' ? pending : confirmed
    if (!state.nextCursor || loadingMore) return
    setLoadingMore(status)
    setMessage('')
    try {
      const data = await readList(status, state.nextCursor)
      const update = (current: ListState): ListState => ({
        items: mergeConnections(current.items, data.connections!),
        nextCursor: data.nextCursor ?? null,
      })
      if (status === 'pending') setPending(update)
      else setConfirmed(update)
    } catch {
      setMessage('没有加载完成，可以重试。')
    } finally {
      setLoadingMore(null)
    }
  }

  if (loading && !preference) {
    return <section className={styles.workspace} aria-busy="true"><p className={styles.status}>正在打开回看</p></section>
  }

  if (!preference) {
    return (
      <section className={styles.workspace}>
        <p className={styles.status} role="alert">{message}</p>
        <button className={styles.retry} type="button" onClick={() => void load()}>重试</button>
      </section>
    )
  }

  const hasReviewContent = pending.items.length > 0 || pendingCount > 0 || confirmed.items.length > 0

  return (
    <section className={styles.workspace} aria-labelledby="review-title">
      <header className={styles.header}>
        <div>
          <p>以前的想法</p>
          <h1 id="review-title">回看</h1>
        </div>
        {preference.enabled ? (
          <button type="button" disabled={preferencePending} onClick={() => void setEnabled(false)}>
            {preferencePending ? '正在保存' : '关闭回看'}
          </button>
        ) : null}
      </header>

      {!preference.enabled ? (
        <div className={styles.intro}>
          <ConnectionMark />
          <h2>看看以前的想法之间有什么联系。</h2>
          <p>开启后，每次保存新内容，retniw会把这次写下或导入的内容和必要的旧想法交给DeepSeek比较。它只找可能的联系，不改写，也不替你保留。</p>
          <button type="button" disabled={preferencePending} onClick={() => void setEnabled(true)}>
            {preferencePending ? '正在开启' : '开启回看'}
          </button>
        </div>
      ) : null}

      {message ? <p className={styles.error} role="alert">{message}</p> : null}

      {(preference.enabled || hasReviewContent) ? <section className={styles.listSection} aria-labelledby="pending-title">
        <div className={styles.sectionHeading}>
          <h2 id="pending-title">等你判断</h2>
          {pendingCount ? <span>{pendingCount}</span> : null}
        </div>
        {pending.items.length ? (
          <div className={styles.list}>
            {pending.items.map((connection) => (
              <ConnectionCard
                connection={connection}
                deciding={decidingId === connection.id}
                key={connection.id}
                onDecide={(decision) => void decide(connection, decision)}
              />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>写下新内容后，可能的联系会出现在这里。</p>
        )}
        {pending.nextCursor ? (
          <button className={styles.more} type="button" disabled={loadingMore !== null} onClick={() => void loadMore('pending')}>
            {loadingMore === 'pending' ? '正在加载' : '查看更多'}
          </button>
        ) : null}
      </section> : null}

      {(preference.enabled || hasReviewContent) ? <section className={styles.listSection} aria-labelledby="confirmed-title">
        <h2 id="confirmed-title">已保留</h2>
        {confirmed.items.length ? (
          <div className={styles.list}>
            {confirmed.items.map((connection) => (
              <ConnectionCard connection={connection} deciding={false} key={connection.id} />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>你保留的联系会留在这里。</p>
        )}
        {confirmed.nextCursor ? (
          <button className={styles.more} type="button" disabled={loadingMore !== null} onClick={() => void loadMore('confirmed')}>
            {loadingMore === 'confirmed' ? '正在加载' : '查看更多'}
          </button>
        ) : null}
      </section> : null}
    </section>
  )
}
