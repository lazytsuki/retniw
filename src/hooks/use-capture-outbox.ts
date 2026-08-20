'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteThoughtOutboxItem,
  listThoughtOutboxItems,
  putThoughtOutboxItem,
  type ThoughtOutboxItem,
} from '@/src/lib/capture/capture-store'

export async function sendThoughtOutboxItem(item: ThoughtOutboxItem) {
  const path = item.createsThought
    ? '/api/thoughts'
    : `/api/thoughts/${item.thoughtId}/entries`
  const body = {
    ...(item.createsThought ? { thoughtId: item.thoughtId } : {}),
    entryId: item.entryId,
    clientRequestId: item.clientRequestId,
    content: item.content,
    entryType: item.entryType,
    sourceLabel: item.sourceLabel,
  }
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) throw new Error('SAVE_FAILED')
}

type OutboxOperations = {
  send: (item: ThoughtOutboxItem) => Promise<void>
  remove: (entryId: string) => Promise<void>
  markFailed: (item: ThoughtOutboxItem) => Promise<void>
}

export async function flushThoughtOutboxItems(
  items: ThoughtOutboxItem[],
  operations: OutboxOperations,
) {
  const queued = items
    .filter((item) => item.state === 'pending')
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.entryId.localeCompare(right.entryId),
    )
  for (const item of queued) {
    try {
      await operations.send(item)
      await operations.remove(item.entryId)
    } catch {
      await operations.markFailed(item)
      return { failedEntryId: item.entryId }
    }
  }
  return { failedEntryId: null }
}

export function useCaptureOutbox(onSynced?: (item: ThoughtOutboxItem) => void) {
  const [items, setItems] = useState<ThoughtOutboxItem[]>([])
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const flushRef = useRef<Promise<void> | null>(null)
  const onSyncedRef = useRef(onSynced)

  useEffect(() => {
    onSyncedRef.current = onSynced
  }, [onSynced])

  const reload = useCallback(async () => {
    const stored = await listThoughtOutboxItems()
    setItems(stored)
    return stored
  }, [])

  const flush = useCallback(() => {
    if (flushRef.current) return flushRef.current

    const operation = (async () => {
      setSyncing(true)
      const stored = await listThoughtOutboxItems()
      await flushThoughtOutboxItems(stored, {
        send: sendThoughtOutboxItem,
        remove: async (entryId) => {
          await deleteThoughtOutboxItem(entryId)
          const item = stored.find((candidate) => candidate.entryId === entryId)
          if (item) onSyncedRef.current?.(item)
        },
        markFailed: (item) =>
          putThoughtOutboxItem({
            ...item,
            state: 'failed',
            updatedAt: new Date().toISOString(),
          }),
      })
      await reload()
    })().finally(() => {
      flushRef.current = null
      setSyncing(false)
    })

    flushRef.current = operation
    return operation
  }, [reload])

  useEffect(() => {
    listThoughtOutboxItems()
      .then((stored) => {
        setItems(stored)
        if (stored.some((item) => item.state === 'pending')) queueMicrotask(() => void flush())
      })
      .finally(() => setReady(true))
  }, [flush])

  const saveDraft = useCallback(async (item: ThoughtOutboxItem) => {
    await putThoughtOutboxItem({ ...item, state: 'draft' })
    setItems(await listThoughtOutboxItems())
  }, [])

  const remove = useCallback(async (entryId: string) => {
    await deleteThoughtOutboxItem(entryId)
    setItems(await listThoughtOutboxItems())
  }, [])

  const enqueue = useCallback(
    async (item: ThoughtOutboxItem) => {
      await putThoughtOutboxItem({ ...item, state: 'pending' })
      setItems(await listThoughtOutboxItems())
      queueMicrotask(() => void flush())
    },
    [flush],
  )

  const retry = useCallback(async () => {
    const stored = await listThoughtOutboxItems()
    await Promise.all(
      stored
        .filter((item) => item.state === 'failed')
        .map((item) =>
          putThoughtOutboxItem({ ...item, state: 'pending', updatedAt: new Date().toISOString() }),
        ),
    )
    await reload()
    await flush()
  }, [flush, reload])

  useEffect(() => {
    const handleOnline = () => void retry()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [retry])

  return { items, ready, syncing, saveDraft, remove, enqueue, retry }
}
