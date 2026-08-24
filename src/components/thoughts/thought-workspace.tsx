'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ThinkingAssist } from './thinking-assist'
import { StreamingAiEntry } from './streaming-ai-entry'
import { ThoughtComposer } from './thought-composer'
import { SyncStatus } from './sync-status'
import { useAiAction } from '@/src/hooks/use-ai-action'
import { useCaptureOutbox } from '@/src/hooks/use-capture-outbox'
import type { ThoughtOutboxItem } from '@/src/lib/capture/capture-store'
import type { Entry } from '@/src/server/repositories/entry-repository'
import type { Thought } from '@/src/server/repositories/thought-repository'
import { EntryActions } from './entry-actions'
import { ImportTextDialog, type ImportSubmission } from './import-text-dialog'
import { useThoughtPosition } from '@/src/hooks/use-thought-position'
import { EntryContent } from './entry-content'
import { isMarkdownContent } from '@/src/lib/markdown'
import { hasNewUserContext } from '@/src/lib/ai-context'
import { aiOutputForDisplay } from '@/src/lib/ai-output'
import { requestHistoryAfterCheckpoint, ThoughtNavigation } from './thought-navigation'
import { ThoughtMenu } from './thought-menu'
import { CheckpointDialog } from './checkpoint-dialog'
import type { ThoughtCheckpoint } from '@/src/server/repositories/checkpoint-repository'
import { useOverlayController } from '@/src/components/overlay-provider'

export type ThoughtSummary = Thought & { firstEntry: Entry | null }

type ThoughtWorkspaceProps = {
  initialThought: Thought | null
  initialEntries: Entry[]
  initialCheckpoints: ThoughtCheckpoint[]
  initialThoughts: ThoughtSummary[]
  initialNextCursor: string | null
}

function nextIds() {
  return { entryId: crypto.randomUUID(), clientRequestId: crypto.randomUUID() }
}

const explicitNewThoughtKey = 'retniw:explicit-new-thought'

export function ThoughtWorkspace({
  initialThought,
  initialEntries,
  initialCheckpoints,
  initialThoughts,
  initialNextCursor,
}: ThoughtWorkspaceProps) {
  const router = useRouter()
  const overlay = useOverlayController()
  const [thoughtId, setThoughtId] = useState(() => initialThought?.id ?? crypto.randomUUID())
  const [ids, setIds] = useState(nextIds)
  const [content, setContent] = useState('')
  const [localEntries, setLocalEntries] = useState<Entry[]>([])
  const [started, setStarted] = useState(Boolean(initialThought))
  const [localCheckpoints, setLocalCheckpoints] = useState<ThoughtCheckpoint[]>([])
  const checkpoints = useMemo(
    () => [...initialCheckpoints, ...localCheckpoints].sort(
      (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    ),
    [initialCheckpoints, localCheckpoints],
  )
  const lastCheckpoint = checkpoints.at(-1)
  const textareaRef = useThoughtPosition(
    thoughtId,
    content,
    lastCheckpoint ? `checkpoint-${lastCheckpoint.id}` : undefined,
    lastCheckpoint?.createdAt,
  )
  const handleEntrySynced = useCallback(
    (item: ThoughtOutboxItem) => {
      if (item.thoughtId !== thoughtId) return
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
    },
    [thoughtId],
  )
  const outbox = useCaptureOutbox(handleEntrySynced)
  const restoredDraft = useRef(false)
  const waitingForFirstSync = useRef<string | null>(null)
  const firstSyncObserved = useRef(false)
  const handleAiSaved = useCallback((entry: Entry) => {
    setLocalEntries((current) => [...current.filter((item) => item.id !== entry.id), entry])
  }, [])
  const ai = useAiAction(handleAiSaved)

  const activeOutbox = useMemo(
    () => outbox.items.filter((item) => item.thoughtId === thoughtId),
    [outbox.items, thoughtId],
  )

  useEffect(() => {
    if (!outbox.ready || restoredDraft.current) return
    restoredDraft.current = true
    if (!initialThought) {
      try {
        const explicitlyStartedNewThought = sessionStorage.getItem(explicitNewThoughtKey) === '1'
        sessionStorage.removeItem(explicitNewThoughtKey)
        if (explicitlyStartedNewThought) return
      } catch {
        // Fall through to normal draft recovery when browser storage is unavailable.
      }
    }
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
    router.replace(`/thoughts/${thoughtId}`, { scroll: false })
  }, [activeOutbox, router, thoughtId])

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
        collectionId: null,
        archivedAt: null,
        deletedAt: null,
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
  }

  async function handleCheckpoint(
    note: string,
    requestIds: { entryId: string; clientRequestId: string },
  ) {
    const response = await fetch(`/api/thoughts/${thoughtId}/checkpoints`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entryId: requestIds.entryId,
        clientRequestId: requestIds.clientRequestId,
        note,
      }),
    })
    const payload = await response.json().catch(() => null) as
      | { data?: { checkpoint?: ThoughtCheckpoint } }
      | null
    if (!response.ok || !payload?.data?.checkpoint) throw new Error('CHECKPOINT_FAILED')
    setLocalCheckpoints((current) => [...current, payload.data!.checkpoint!])
    requestHistoryAfterCheckpoint()
    router.push('/')
  }

  const timeline = useMemo(() => [
    ...entries.map((entry) => ({
      kind: 'entry' as const,
      createdAt: entry.createdAt,
      id: entry.id,
      entry,
    })),
    ...checkpoints.map((checkpoint) => ({
      kind: 'checkpoint' as const,
      createdAt: checkpoint.createdAt,
      id: checkpoint.id,
      checkpoint,
    })),
  ].sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  ), [checkpoints, entries])

  return (
    <div className="thought-layout">
      <ThoughtNavigation
        activeThoughtId={thoughtId}
        currentStarted={started}
        initialNextCursor={initialNextCursor}
        thoughts={displayThoughts}
      />
      <section className="thought-main" id="current-thought" aria-label="当前想法">
        <header className="workspace-heading">
          {started ? (
            <p className="workspace-kicker">继续写</p>
          ) : (
            <h1>写下你正在想的。</h1>
          )}
          <ThoughtMenu
            thoughtId={started ? thoughtId : null}
            organizeDisabled={!canUseAi}
            organizeRunning={ai.state.status === 'streaming' && ai.state.action === 'organize'}
            onImport={() => overlay.open('import')}
            onOrganize={() => void ai.run(thoughtId, 'organize')}
          />
        </header>
        {timeline.length > 0 && (
          <div className="thought-entries">
            {timeline.map((item) => {
              if (item.kind === 'checkpoint') {
                return (
                  <div className="thought-checkpoint" id={`checkpoint-${item.checkpoint.id}`} key={item.id}>
                    <span>先到这里</span>
                    {item.checkpoint.note && <p>{item.checkpoint.note}</p>}
                  </div>
                )
              }
              const entry = item.entry
              const displayContent = entry.entryType === 'ai'
                ? aiOutputForDisplay(entry.content, entry.aiAction)
                : entry.content
              return (
                <article
                  className={entry.entryType === 'ai' ? 'thought-entry thought-entry--assist' : 'thought-entry'}
                  id={`entry-${entry.id}`}
                  key={entry.id}
                >
                  {entry.entryType === 'import' && <p className="entry-source">来自 {entry.sourceLabel}</p>}
                  {entry.entryType === 'ai' && (
                    <p className="entry-source entry-source--assist">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 5v5a4 4 0 0 0 4 4h8" />
                        <path d="m15 11 3 3-3 3" />
                        <circle cx="6" cy="5" r="2" />
                      </svg>
                      {entry.aiAction === 'organize' ? '整理结果' : '帮我接着想'}
                    </p>
                  )}
                  <EntryContent
                    content={displayContent}
                    markdown={isMarkdownContent(entry.entryType, entry.sourceLabel)}
                  />
                  <EntryActions content={displayContent} />
                </article>
              )
            })}
          </div>
        )}
        <StreamingAiEntry state={ai.state} onClear={ai.clear} />
        <ThoughtComposer
          content={content}
          hasEntries={entries.length > 0}
          onChange={handleChange}
          onSubmit={handleSubmit}
          textareaRef={textareaRef}
        />
        <SyncStatus items={activeOutbox} syncing={outbox.syncing} onRetry={() => void outbox.retry()} />
        {entries.length > 0 && (
          <button
            className="checkpoint-action"
            type="button"
            onClick={(event) => overlay.open('checkpoint', event.currentTarget)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v16M7 5h10l-2.5 4L17 13H7" /></svg>
            先到这里
          </button>
        )}
        {entries.length > 0 && (
          <ThinkingAssist
            disabled={!canUseAi || ai.state.status === 'streaming'}
            waitingForInput={started && !canUseAi}
            running={ai.state.status === 'streaming' && ai.state.action === 'advance'}
            onContinue={() => void ai.run(thoughtId, 'advance')}
          />
        )}
        <ImportTextDialog
          open={overlay.isOpen('import')}
          currentAllowed={started}
          onClose={() => overlay.close('import')}
          onImport={handleImport}
        />
        <CheckpointDialog open={overlay.isOpen('checkpoint')} onSave={handleCheckpoint} />
      </section>
    </div>
  )
}
