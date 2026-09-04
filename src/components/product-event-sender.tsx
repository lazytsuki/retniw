'use client'

import { useEffect } from 'react'
import { currentUserBoundFetch } from '@/src/lib/auth/user-bound-fetch'

type DailyProductEventName = 'workspace_active_day' | 'review_opened'

type ConnectionOpenedEvent = {
  eventName: 'connection_opened'
  requestId: string
  connectionId: string
  thoughtId: string
}

async function sendProductEvent(
  event: { eventName: DailyProductEventName } | ConnectionOpenedEvent,
) {
  try {
    const response = await currentUserBoundFetch('/api/product-events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
      referrerPolicy: 'no-referrer',
    })
    return response.ok
  } catch {
    return false
  }
}

export function createProductEventRequestId() {
  try {
    return crypto.randomUUID()
  } catch {
    return null
  }
}

export function recordConnectionOpened(connectionId: string, thoughtId: string) {
  const requestId = createProductEventRequestId()
  if (!requestId) return
  void sendProductEvent({
    eventName: 'connection_opened',
    requestId,
    connectionId,
    thoughtId,
  })
}

export function useVisibleProductEvent(eventName: DailyProductEventName) {
  useEffect(() => {
    let disposed = false
    let recorded = false
    let sending = false

    const recordWhenVisible = async () => {
      if (disposed || recorded || sending || document.visibilityState !== 'visible') return
      sending = true
      recorded = await sendProductEvent({ eventName })
      sending = false
    }
    const onVisibilityChange = () => void recordWhenVisible()

    void recordWhenVisible()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [eventName])
}

export function VisibleProductEvent({ eventName }: { eventName: DailyProductEventName }) {
  useVisibleProductEvent(eventName)
  return null
}
