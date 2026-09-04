'use client'

import { useState } from 'react'
import { currentUserBoundFetch } from '@/src/lib/auth/user-bound-fetch'
import type { Connection } from '@/src/server/repositories/fragment-detail-repository'

type Props = { connection: Connection; onDecided: (status: 'confirmed' | 'rejected') => void }

export function ConnectionCandidate({ connection, onDecided }: Props) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function decide(decision: 'confirmed' | 'rejected') {
    if (saving) return
    setSaving(true)
    setMessage('')
    try {
      const response = await currentUserBoundFetch(`/api/connections/${connection.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (!response.ok) throw new Error('SAVE_FAILED')
      onDecided(decision)
    } catch {
      setMessage('还没有保存，可以再试一次。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="timeline-card">
      <p className="section-label">发现一条关联</p>
      <p>{connection.rationale}</p>
      <blockquote>{connection.otherFragment.content}</blockquote>
      {connection.status === 'pending' ? (
        <div className="timeline-actions">
          <button className="button-secondary" type="button" disabled={saving} onClick={() => void decide('rejected')}>
            无关
          </button>
          <button type="button" disabled={saving} onClick={() => void decide('confirmed')}>
            保留关联
          </button>
        </div>
      ) : (
        <p className="timeline-state">{connection.status === 'confirmed' ? '已确认' : '已否定'}</p>
      )}
      {message ? <p className="timeline-message">{message}</p> : null}
    </section>
  )
}
