'use client'

import type { RelationConnection } from '@/src/hooks/use-relation-check'
import type { ThoughtConnectionDecision } from '@/src/server/repositories/thought-connection-repository'
import { aiOutputForDisplay } from '@/src/lib/ai-output'

type RelationCandidateProps = {
  currentThoughtId: string
  status: 'idle' | 'checking' | 'candidate' | 'empty' | 'decided' | 'error'
  connection: RelationConnection | null
  message: string
  onCheck: () => void
  onDecide: (decision: ThoughtConnectionDecision) => void
}

export function RelationCandidate({
  currentThoughtId,
  status,
  connection,
  message,
  onCheck,
  onDecide,
}: RelationCandidateProps) {
  if (status === 'idle' || status === 'empty') return null
  if (status === 'checking') return <p className="relation-status">正在寻找可能的联系</p>
  if (status === 'error') {
    return (
      <div className="relation-status relation-status--error">
        <span>{message}</span>
        <button type="button" onClick={onCheck}>重试</button>
      </div>
    )
  }
  if (!connection) return null

  const currentEntry = connection.sourceThoughtId === currentThoughtId
    ? connection.sourceEntry
    : connection.targetEntry
  const otherEntry = connection.sourceThoughtId === currentThoughtId
    ? connection.targetEntry
    : connection.sourceEntry
  const currentContent = currentEntry
    ? aiOutputForDisplay(currentEntry.content, currentEntry.aiAction)
    : ''
  const otherContent = otherEntry
    ? aiOutputForDisplay(otherEntry.content, otherEntry.aiAction)
    : ''

  return (
    <section className="relation-candidate" aria-labelledby={`relation-${connection.id}`}>
      <p id={`relation-${connection.id}`} className="entry-source">这段旧想法可能和现在有关</p>
      <div className="relation-pair">
        <div>
          <span>现在</span>
          <blockquote>{currentContent}</blockquote>
        </div>
        <div>
          <span>以前</span>
          <blockquote>{otherContent}</blockquote>
        </div>
      </div>
      {status === 'candidate' ? (
        <div className="relation-actions">
          <button type="button" onClick={() => onDecide('confirmed')}>保留联系</button>
          <button type="button" onClick={() => onDecide('rejected')}>忽略</button>
        </div>
      ) : (
        <p className="relation-decision">
          {connection.status === 'confirmed' ? '已保留这条联系' : '已忽略，不会再次提出同一对'}
        </p>
      )}
      {message && <p className="relation-message">{message}</p>}
    </section>
  )
}
