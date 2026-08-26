'use client'

import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'
import styles from './review-workspace.module.css'
import type { ReviewPreference } from '@/src/server/repositories/review-preference-repository'
import type { ReviewConnection } from '@/src/server/repositories/thought-connection-repository'

type ReviewResponse = {
  data?: {
    preference?: ReviewPreference
    connections?: ReviewConnection[]
    pendingCount?: number
    nextCursor?: string | null
  }
}

type ReviewScanResponse = {
  data?: {
    status?: 'disabled' | 'not-enough-content' | 'processed' | 'provider-failed' | 'persistence-failed'
    created?: number
  }
}

type ListState = {
  items: ReviewConnection[]
  nextCursor: string | null
}

type ReviewInitialData = {
  preference: ReviewPreference
  pending: ListState
  pendingCount: number
  confirmed: ListState
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
          <span>后来写的</span>
          <p>{connection.source.excerpt}</p>
          <Link href={`/thoughts/${connection.source.thoughtId}#entry-${connection.source.entryId}`}>
            打开原文<ArrowMark />
          </Link>
        </div>
        <div>
          <span>更早写的</span>
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

export function ReviewWorkspace({ initialData }: { initialData: ReviewInitialData | null }) {
  const [preference, setPreference] = useState<ReviewPreference | null>(initialData?.preference ?? null)
  const [pending, setPending] = useState<ListState>(initialData?.pending ?? emptyList)
  const [confirmed, setConfirmed] = useState<ListState>(initialData?.confirmed ?? emptyList)
  const [pendingCount, setPendingCount] = useState(initialData?.pendingCount ?? 0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState<'pending' | 'confirmed' | null>(null)
  const [preferencePending, setPreferencePending] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [message, setMessage] = useState(initialData ? '' : '没有加载完成，可以重试。')
  const [notice, setNotice] = useState('')
  const preferencePendingRef = useRef(false)
  const scanningRef = useRef(false)

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

  async function setEnabled(enabled: boolean, scanAfter = false) {
    if (!preference || preferencePendingRef.current) return
    const previous = preference
    let saved = false
    preferencePendingRef.current = true
    setPreference({ ...preference, enabled })
    setPreferencePending(true)
    setMessage('')
    setNotice('')
    try {
      const response = await fetch('/api/review/preference', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const payload = await response.json().catch(() => null) as ReviewResponse | null
      if (!response.ok || !payload?.data?.preference) throw new Error('UPDATE_FAILED')
      setPreference(payload.data.preference)
      saved = true
    } catch {
      setPreference(previous)
      setMessage('没有保存，可以重试。')
    } finally {
      preferencePendingRef.current = false
      setPreferencePending(false)
    }
    if (saved && enabled && scanAfter) await scanExistingThoughts()
  }

  async function scanExistingThoughts() {
    if (scanningRef.current) return
    scanningRef.current = true
    setScanning(true)
    setMessage('')
    setNotice('')
    try {
      const response = await fetch('/api/review/scan', { method: 'POST' })
      const payload = await response.json().catch(() => null) as ReviewScanResponse | null
      if (!response.ok || !payload?.data?.status) throw new Error('SCAN_FAILED')
      if (payload.data.status === 'disabled') {
        setMessage('先开启回看，再开始串联。')
        return
      }
      if (payload.data.status === 'provider-failed') {
        setMessage('这次没有完成，可以重试。')
        return
      }
      if (payload.data.status === 'not-enough-content') {
        setNotice('至少需要两条想法，才能开始串联。')
        return
      }
      const created = payload.data.created ?? 0
      await load()
      if (payload.data.status === 'persistence-failed') {
        setMessage(created > 0
          ? `只保存了${created}条联系，其余没有保存，可以重试。`
          : '这次找到的联系没有保存，可以重试。')
        return
      }
      setNotice(created > 0
        ? `找到了${created}条联系，等你判断。`
        : '这次没有找到新的明确联系。')
    } catch {
      setMessage('这次没有完成，可以重试。')
    } finally {
      scanningRef.current = false
      setScanning(false)
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

      <div className={styles.intro} aria-busy={scanning || undefined}>
        <ConnectionMark />
        <h2>串联已有想法</h2>
        <p>
          {preference.enabled
            ? '把最多20条最近想法的开头片段交给DeepSeek，找出最多3条有依据的联系。结果先由你判断，不改写，也不自动保留。'
            : '开启后，会先把最多20条最近想法的开头片段交给DeepSeek，找出最多3条有依据的联系；以后保存新内容时也会继续找。结果先由你判断，不改写，也不自动保留。'}
        </p>
        <button
          type="button"
          disabled={preferencePending || scanning}
          onClick={() => preference.enabled
            ? void scanExistingThoughts()
            : void setEnabled(true, true)}
        >
          {preferencePending
            ? '正在开启'
            : scanning
              ? '正在串联'
              : preference.enabled
                ? '开始串联'
                : '开启并开始串联'}
        </button>
      </div>

      {message ? <p className={styles.error} role="alert">{message}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

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
          <p className={styles.empty}>开始串联，或继续写下新内容后，可能的联系会出现在这里。</p>
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
