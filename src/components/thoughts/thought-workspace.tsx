'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AiActions } from './ai-actions'
import { StreamingAiEntry } from './streaming-ai-entry'
import { ThoughtComposer } from './thought-composer'
import { SyncStatus } from './sync-status'
import { useAiAction } from '@/src/hooks/use-ai-action'
import { useCaptureOutbox } from '@/src/hooks/use-capture-outbox'
import { useRelationCheck, type RelationConnection } from '@/src/hooks/use-relation-check'
import type { ThoughtOutboxItem } from '@/src/lib/capture/capture-store'
import type { Entry } from '@/src/server/repositories/entry-repository'
import type { Thought } from '@/src/server/repositories/thought-repository'
import { RelationCandidate } from './relation-candidate'
import { EntryActions } from './entry-actions'
import { ExportMenu } from './export-menu'
import { ImportTextDialog, type ImportSubmission } from './import-text-dialog'
import { useThoughtPosition } from '@/src/hooks/use-thought-position'
import { EntryContent } from './entry-content'
import { isMarkdownContent, markdownToPlainText } from '@/src/lib/markdown'
import { hasNewUserContext } from '@/src/lib/ai-context'

export type ThoughtSummary = Thought & { firstEntry: Entry | null }

type ThoughtWorkspaceProps = {
  initialThought: Thought | null
  initialEntries: Entry[]
  initialThoughts: ThoughtSummary[]
  initialConnections: RelationConnection[]
}

function nextIds() {
  return { entryId: crypto.randomUUID(), clientRequestId: crypto.randomUUID() }
}

export function ThoughtWorkspace({
  initialThought,
  initialEntries,
  initialThoughts,
  initialConnections,
}: ThoughtWorkspaceProps) {
  const router = useRouter()
  const [thoughtId, setThoughtId] = useState(() => initialThought?.id ?? crypto.randomUUID())
  const [ids, setIds] = useState(nextIds)
  const [content, setContent] = useState('')
  const [localEntries, setLocalEntries] = useState<Entry[]>([])
  const [started, setStarted] = useState(Boolean(initialThought))
  const [importOpen, setImportOpen] = useState(false)
  const textareaRef = useThoughtPosition(thoughtId, content)
  const initialPending = initialConnections.find((connection) => connection.status === 'pending') ?? null
  const {
    state: relationState,
    check: checkRelation,
    decide: decideRelation,
  } = useRelationCheck(initialPending)
  const handleEntrySynced = useCallback(
    (item: ThoughtOutboxItem) => {
      setLocalEntries((current) => {
        if (current.some((entry) => entry.id === item.entryId)) return current
        return [...current, {
          id: item.entryId,
          thoughtId: item.thoughtId,
          clientRequestId: item.clientRequestId,
          entryType: item.entryType,
          content: item.content,
          sourceLabel: item.sourceLabel,
          aiAction: null,
          createdAt: item.createdAt,
        }]
      })
      void checkRelation(item.thoughtId)
    },
    [checkRelation],
  )
  const outbox = useCaptureOutbox(handleEntrySynced)
  const restoredDraft = useRef(false)
  const waitingForFirstSync = useRef<string | null>(null)
  const firstSyncObserved = useRef(false)
  const relationCatchupStarted = useRef(false)
  const handleAiSaved = useCallback((entry: Entry) => {
    setLocalEntries((current) => [...current.filter((item) => item.id !== entry.id), entry])
  }, [])
  const ai = useAiAction(handleAiSaved)

  useEffect(() => {
    if (!initialThought || relationCatchupStarted.current || initialPending) return
    if (
      initialThought.relationCheckedAt &&
      initialThought.relationCheckedAt >= initialThought.lastActivityAt
    ) return
    relationCatchupStarted.current = true
    void checkRelation(initialThought.id)
  }, [checkRelation, initialPending, initialThought])

  const activeOutbox = useMemo(
    () => outbox.items.filter((item) => item.thoughtId === thoughtId),
    [outbox.items, thoughtId],
  )

  useEffect(() => {
    if (!outbox.ready || restoredDraft.current) return
    restoredDraft.current = true
    const localItems = initialThought
      ? outbox.items.filter((item) => item.thoughtId === initialThought.id)
      : outbox.items.filter((item) => item.createsThought)
    const restored = localItems.at(-1)
    if (!restored) return
    queueMicrotask(() => {
      setThoughtId(restored.thoughtId)
      setIds(
        restored.state === 'draft'
          ? { entryId: restored.entryId, clientRequestId: restored.clientRequestId }
          : nextIds(),
      )
      setContent(restored.state === 'draft' ? restored.content : '')
      setStarted(restored.state !== 'draft' || !restored.createsThought)
      if (restored.createsThought && restored.state !== 'draft') {
        waitingForFirstSync.current = restored.entryId
        firstSyncObserved.current = true
      }
    })
  }, [initialThought, outbox.items, outbox.ready])

  useEffect(() => {
    if (!waitingForFirstSync.current) return
    const firstStillLocal = activeOutbox.some((item) => item.entryId === waitingForFirstSync.current)
    if (firstStillLocal) {
      firstSyncObserved.current = true
      return
    }
    if (!firstSyncObserved.current) return
    waitingForFirstSync.current = null
    firstSyncObserved.current = false
    window.history.replaceState(null, '', `/thoughts/${thoughtId}`)
  }, [activeOutbox, thoughtId])

  const entries = useMemo(() => {
    const combined = new Map<string, Entry>()
    for (const entry of initialEntries) combined.set(entry.id, entry)
    for (const entry of localEntries) combined.set(entry.id, entry)
    for (const item of activeOutbox) {
      if (item.state === 'draft') continue
      combined.set(item.entryId, {
        id: item.entryId,
        thoughtId: item.thoughtId,
        clientRequestId: item.clientRequestId,
        entryType: item.entryType,
        content: item.content,
        sourceLabel: item.sourceLabel,
        aiAction: null,
        createdAt: item.createdAt,
      })
    }
    return Array.from(combined.values()).sort(
      (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    )
  }, [activeOutbox, initialEntries, localEntries])

  const canUseAi = started && entries.length > 0 && hasNewUserContext(entries)
  const displayThoughts = useMemo(() => {
    if (!started || entries.length === 0) return initialThoughts
    const firstEntry = entries[0]
    const lastActivityAt = entries.at(-1)?.createdAt ?? firstEntry.createdAt
    const current: ThoughtSummary = {
      ...(initialThought ?? {
        id: thoughtId,
        createdAt: firstEntry.createdAt,
        relationCheckedAt: null,
      }),
      lastActivityAt,
      firstEntry,
    }
    return [current, ...initialThoughts.filter((thought) => thought.id !== thoughtId)]
      .sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt))
  }, [entries, initialThought, initialThoughts, started, thoughtId])

  function draftItem(nextContent: string): ThoughtOutboxItem {
    const now = new Date().toISOString()
    return {
      thoughtId,
      entryId: ids.entryId,
      clientRequestId: ids.clientRequestId,
      content: nextContent,
      entryType: 'user',
      sourceLabel: null,
      createsThought: !started,
      state: 'draft',
      createdAt: now,
      updatedAt: now,
    }
  }

  function handleChange(nextContent: string) {
    setContent(nextContent)
    if (nextContent) void outbox.saveDraft(draftItem(nextContent))
    else void outbox.remove(ids.entryId)
  }

  function handleSubmit() {
    const trimmed = content.trim()
    if (!trimmed) return
    const item = { ...draftItem(trimmed), state: 'pending' as const }
    const optimistic: Entry = {
      id: item.entryId,
      thoughtId: item.thoughtId,
      clientRequestId: item.clientRequestId,
      entryType: item.entryType,
      content: item.content,
      sourceLabel: item.sourceLabel,
      aiAction: null,
      createdAt: item.createdAt,
    }

    setLocalEntries((current) => [...current, optimistic])
    setContent('')
    setIds(nextIds())
    if (!started) {
      setStarted(true)
      waitingForFirstSync.current = item.entryId
      firstSyncObserved.current = false
    }
    void outbox.enqueue(item)
  }

  async function handleImport(submission: ImportSubmission) {
    const createsThought = submission.target === 'new'
    const targetThoughtId = createsThought ? crypto.randomUUID() : thoughtId
    const entryId = crypto.randomUUID()
    const response = await fetch(
      createsThought ? '/api/thoughts' : `/api/thoughts/${targetThoughtId}/entries`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(createsThought ? { thoughtId: targetThoughtId } : {}),
          entryId,
          clientRequestId: crypto.randomUUID(),
          content: submission.content,
          entryType: 'import',
          sourceLabel: submission.sourceLabel,
        }),
      },
    )
    const payload = (await response.json().catch(() => null)) as
      | { data?: { entry?: Entry }; error?: { message?: string } }
      | null
    if (!response.ok || !payload?.data?.entry) {
      throw new Error(payload?.error?.message ?? '导入失败，请重试')
    }

    if (createsThought) {
      router.push(`/thoughts/${targetThoughtId}`)
      return
    }

    setLocalEntries((current) => [...current, payload.data!.entry!])
    void checkRelation(targetThoughtId)
  }

  return (
    <div className="thought-layout">
      <section className="thought-main" aria-label="当前思考">
        <div className="thought-tools">
          <button type="button" onClick={() => setImportOpen(true)}>导入</button>
          <ExportMenu thoughtId={started ? thoughtId : null} />
        </div>
        {entries.length > 0 && (
          <div className="thought-entries">
            {entries.map((entry) => (
              <article className="thought-entry" key={entry.id}>
                {entry.entryType === 'import' && <p className="entry-source">来自 {entry.sourceLabel}</p>}
                {entry.entryType === 'ai' && (
                  <p className="entry-source">AI · {entry.aiAction === 'advance' ? '推进' : entry.aiAction === 'question' ? '追问' : '整理'}</p>
                )}
                <EntryContent
                  content={entry.content}
                  markdown={isMarkdownContent(entry.entryType, entry.sourceLabel)}
                />
                <EntryActions content={entry.content} />
              </article>
            ))}
          </div>
        )}
        <StreamingAiEntry state={ai.state} onClear={ai.clear} />
        <ThoughtComposer
          content={content}
          onChange={handleChange}
          onSubmit={handleSubmit}
          textareaRef={textareaRef}
        />
        <SyncStatus items={activeOutbox} syncing={outbox.syncing} onRetry={() => void outbox.retry()} />
        <AiActions
          aiDisabled={!canUseAi}
          relationDisabled={!started || entries.length === 0}
          waitingForInput={started && entries.length > 0 && !canUseAi}
          running={ai.state.status === 'streaming'}
          onAction={(action) => void ai.run(thoughtId, action)}
          relationRunning={relationState.status === 'checking'}
          onRelation={() => void checkRelation(thoughtId)}
        />
        <RelationCandidate
          currentThoughtId={thoughtId}
          status={relationState.status}
          connection={relationState.connection}
          message={relationState.message}
          onCheck={() => void checkRelation(thoughtId)}
          onDecide={(decision) => void decideRelation(decision)}
        />
        <ImportTextDialog
          open={importOpen}
          currentAllowed={started}
          onClose={() => setImportOpen(false)}
          onImport={handleImport}
        />
      </section>

      {displayThoughts.length > 0 && (
        <aside className="thought-recent" aria-labelledby="recent-thoughts-title">
          <h2 id="recent-thoughts-title">最近</h2>
          <div className="thought-list">
            {displayThoughts.map((thought) => (
              <Link
                className={thought.id === thoughtId ? 'thought-link thought-link--active' : 'thought-link'}
                href={`/thoughts/${thought.id}`}
                key={thought.id}
              >
                <span>
                  {thought.firstEntry
                    ? isMarkdownContent(thought.firstEntry.entryType, thought.firstEntry.sourceLabel)
                      ? markdownToPlainText(thought.firstEntry.content)
                      : thought.firstEntry.content
                    : '未命名内容'}
                </span>
                <time dateTime={thought.lastActivityAt}>
                  {new Intl.DateTimeFormat('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(thought.lastActivityAt))}
                </time>
              </Link>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}
