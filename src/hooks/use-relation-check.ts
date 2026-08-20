'use client'

import { useCallback, useRef, useState } from 'react'
import type { Entry } from '@/src/server/repositories/entry-repository'
import type { ThoughtConnectionDecision } from '@/src/server/repositories/thought-connection-repository'

export type RelationConnection = {
  id: string
  sourceThoughtId: string
  targetThoughtId: string
  sourceEntry: Entry | null
  targetEntry: Entry | null
  rationale: string
  status: 'pending' | 'confirmed' | 'rejected'
  decidedAt: string | null
  createdAt: string
}

type RelationState = {
  status: 'idle' | 'checking' | 'candidate' | 'empty' | 'decided' | 'error'
  connection: RelationConnection | null
  message: string
}

export function useRelationCheck(initialConnection: RelationConnection | null) {
  const [state, setState] = useState<RelationState>({
    status: initialConnection ? 'candidate' : 'idle',
    connection: initialConnection,
    message: '',
  })
  const checking = useRef(false)

  const check = useCallback(async (thoughtId: string) => {
    if (checking.current) return
    checking.current = true
    setState((current) => ({ ...current, status: 'checking', message: '' }))
    try {
      const response = await fetch(`/api/thoughts/${thoughtId}/relations/check`, { method: 'POST' })
      if (!response.ok) throw new Error('RELATION_CHECK_FAILED')
      const payload = (await response.json()) as { data: { connection: RelationConnection | null } }
      setState({
        status: payload.data.connection ? 'candidate' : 'empty',
        connection: payload.data.connection,
        message: '',
      })
    } catch {
      setState((current) => ({
        ...current,
        status: 'error',
        message: '联系检查没有完成，不影响继续记录。',
      }))
    } finally {
      checking.current = false
    }
  }, [])

  const decide = useCallback(async (decision: ThoughtConnectionDecision) => {
    setState((current) => ({ ...current, message: '' }))
    try {
      const connectionId = state.connection?.id ?? ''
      if (!connectionId) return
      const response = await fetch(`/api/thought-connections/${connectionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (!response.ok) throw new Error('RELATION_DECISION_FAILED')
      const payload = (await response.json()) as { data: { connection: RelationConnection } }
      setState({ status: 'decided', connection: payload.data.connection, message: '' })
    } catch {
      setState((current) => ({ ...current, message: '没有保存这个决定，请重试。' }))
    }
  }, [state.connection])

  return { state, check, decide }
}
