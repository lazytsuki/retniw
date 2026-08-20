'use client'

import { useState } from 'react'
import type { Clarification } from '@/src/server/repositories/fragment-detail-repository'

type Props = {
  clarification: Clarification
  onAnswered: (answer: string, answeredAt: string) => void
  onSkip: () => void
}

export function ClarificationCard({ clarification, onAnswered, onSkip }: Props) {
  const [answer, setAnswer] = useState(clarification.answer ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function submit() {
    if (!answer.trim() || saving) return
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch(`/api/clarifications/${clarification.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answer }),
      })
      if (!response.ok) throw new Error('SAVE_FAILED')
      const result = (await response.json()) as {
        data: { clarification: { answer: string; answeredAt: string } }
      }
      onAnswered(result.data.clarification.answer, result.data.clarification.answeredAt)
    } catch {
      setMessage('还没有保存，可以再试一次。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="timeline-card" aria-labelledby={`clarification-${clarification.id}`}>
      <p className="section-label">可选问题</p>
      <h2 id={`clarification-${clarification.id}`}>{clarification.question}</h2>
      {clarification.answer ? (
        <p className="timeline-answer">{clarification.answer}</p>
      ) : (
        <>
          <textarea
            maxLength={10_000}
            value={answer}
            placeholder="回答（可选）"
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== 'Enter' ||
                event.shiftKey ||
                event.nativeEvent.isComposing ||
                event.keyCode === 229
              ) return
              event.preventDefault()
              void submit()
            }}
          />
          <div className="timeline-actions">
            <button className="button-secondary" type="button" onClick={onSkip}>
              暂不回答
            </button>
            <button type="button" disabled={!answer.trim() || saving} onClick={() => void submit()}>
              {saving ? '保存中' : '保存回答'}
            </button>
          </div>
          {message ? <p className="timeline-message">{message}</p> : null}
        </>
      )}
    </section>
  )
}
