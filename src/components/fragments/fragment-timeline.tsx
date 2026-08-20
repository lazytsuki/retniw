'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ClarificationCard } from '@/src/components/fragments/clarification-card'
import { ConnectionCandidate } from '@/src/components/fragments/connection-candidate'
import type { FragmentDetailRepository } from '@/src/server/repositories/fragment-detail-repository'

type FragmentDetail = Awaited<ReturnType<FragmentDetailRepository['get']>>

export function FragmentTimeline({ initialFragment }: { initialFragment: FragmentDetail }) {
  const [fragment, setFragment] = useState(initialFragment)
  const [questionSkipped, setQuestionSkipped] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'clarifying' | 'reconnecting' | 'clarify-error' | 'reconnect-error'>(
    !initialFragment.clarification
      ? 'clarifying'
      : initialFragment.clarification.answer && !initialFragment.reconnectCheckedAt
        ? 'reconnecting'
        : 'idle',
  )
  const requestedClarification = useRef(false)
  const requestedReconnect = useRef(false)

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/fragments/${initialFragment.id}`)
    if (!response.ok) return null
    const result = (await response.json()) as { data: { fragment: FragmentDetail } }
    setFragment(result.data.fragment)
    return result.data.fragment
  }, [initialFragment.id])

  const requestClarification = useCallback(async () => {
    if (requestedClarification.current) return
    requestedClarification.current = true
    setPhase('clarifying')
    try {
      const response = await fetch(`/api/fragments/${initialFragment.id}/clarification`, { method: 'POST' })
      if (!response.ok) throw new Error('CLARIFY_FAILED')
      await refresh()
      setPhase('idle')
    } catch {
      setPhase('clarify-error')
    }
  }, [initialFragment.id, refresh])

  const requestReconnect = useCallback(async () => {
    if (requestedReconnect.current || fragment.reconnectCheckedAt) return
    requestedReconnect.current = true
    setPhase('reconnecting')
    try {
      const response = await fetch(`/api/fragments/${initialFragment.id}/reconnect`, { method: 'POST' })
      if (!response.ok) throw new Error('RECONNECT_FAILED')
      await refresh()
      setPhase('idle')
    } catch {
      setPhase('reconnect-error')
    }
  }, [fragment.reconnectCheckedAt, initialFragment.id, refresh])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!fragment.clarification) {
        void requestClarification()
        return
      }
      if (fragment.clarification.answer && !fragment.reconnectCheckedAt) {
        void requestReconnect()
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fragment.clarification, fragment.reconnectCheckedAt, requestClarification, requestReconnect])

  function retryClarification() {
    requestedClarification.current = false
    void requestClarification()
  }

  function retryReconnect() {
    requestedReconnect.current = false
    void requestReconnect()
  }

  return (
    <div className="timeline">
      {phase === 'clarifying' ? <p className="timeline-progress">正在生成问题…</p> : null}
      {phase === 'clarify-error' ? (
        <div className="timeline-notice">
          <p>问题暂时没有生成，原文已经保存。</p>
          <button type="button" onClick={retryClarification}>重试</button>
        </div>
      ) : null}
      {fragment.clarification && !questionSkipped ? (
        <ClarificationCard
          clarification={fragment.clarification}
          onSkip={() => {
            setQuestionSkipped(true)
            void requestReconnect()
          }}
          onAnswered={(answer, answeredAt) => {
            setFragment((current) => ({
              ...current,
              clarification: current.clarification
                ? { ...current.clarification, answer, answeredAt }
                : null,
            }))
          }}
        />
      ) : null}
      {phase === 'reconnecting' ? <p className="timeline-progress">正在检查相关记录…</p> : null}
      {phase === 'reconnect-error' ? (
        <div className="timeline-notice">
          <p>关联检查暂时失败，不影响这条记录。</p>
          <button type="button" onClick={retryReconnect}>重试</button>
        </div>
      ) : null}
      {fragment.connections.map((connection) => (
        <ConnectionCandidate
          key={connection.id}
          connection={connection}
          onDecided={(status) =>
            setFragment((current) => ({
              ...current,
              connections:
                status === 'rejected'
                  ? current.connections.filter((item) => item.id !== connection.id)
                  : current.connections.map((item) =>
                      item.id === connection.id ? { ...item, status } : item,
                    ),
            }))
          }
        />
      ))}
      {fragment.reconnectCheckedAt && fragment.connections.length === 0 ? (
        <p className="timeline-complete">没有发现明显关联。</p>
      ) : null}
      <Link className="continue-link" href="/">继续记录</Link>
    </div>
  )
}
