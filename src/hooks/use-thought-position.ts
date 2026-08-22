'use client'

import { useEffect, useRef, type RefObject } from 'react'

export type ThoughtPosition = {
  scrollY: number
  selectionStart: number
  selectionEnd: number
  updatedAt: number
}

export function thoughtPositionKey(thoughtId: string) {
  return `retniw:thought-position:${thoughtId}`
}

export function parseThoughtPosition(value: string | null): ThoughtPosition | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<ThoughtPosition>
    if (
      typeof parsed.scrollY === 'number' &&
      parsed.scrollY >= 0 &&
      typeof parsed.selectionStart === 'number' &&
      parsed.selectionStart >= 0 &&
      typeof parsed.selectionEnd === 'number' &&
      parsed.selectionEnd >= parsed.selectionStart
    ) {
      return {
        scrollY: parsed.scrollY,
        selectionStart: parsed.selectionStart,
        selectionEnd: parsed.selectionEnd,
        updatedAt: typeof parsed.updatedAt === 'number' && parsed.updatedAt >= 0
          ? parsed.updatedAt
          : 0,
      }
    }
  } catch {}
  return null
}

export function savedPositionIsNewer(
  saved: ThoughtPosition | null,
  fallbackCreatedAt?: string,
) {
  if (!saved) return false
  if (!fallbackCreatedAt) return true
  const fallbackTime = Date.parse(fallbackCreatedAt)
  if (Number.isNaN(fallbackTime)) return true
  return saved.updatedAt > fallbackTime
}

export function useThoughtPosition(
  thoughtId: string,
  content: string,
  fallbackElementId?: string,
  fallbackCreatedAt?: string,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const restoredId = useRef<string | null>(null)
  const navigationStarted = useRef(false)

  useEffect(() => {
    navigationStarted.current = false
    const save = () => {
      if (restoredId.current !== thoughtId || navigationStarted.current) return
      const textarea = textareaRef.current
      const position: ThoughtPosition = {
        scrollY: window.scrollY,
        selectionStart: textarea?.selectionStart ?? 0,
        selectionEnd: textarea?.selectionEnd ?? 0,
        updatedAt: Date.now(),
      }
      sessionStorage.setItem(thoughtPositionKey(thoughtId), JSON.stringify(position))
    }
    let frame = 0
    const scheduleSave = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(save)
    }
    const preserveBeforeNavigation = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!anchor || anchor.hasAttribute('download')) return
      save()
      queueMicrotask(() => {
        if (!event.defaultPrevented) navigationStarted.current = true
      })
    }
    const preserveBeforeHistoryNavigation = () => {
      save()
      navigationStarted.current = true
    }
    window.addEventListener('scroll', scheduleSave, { passive: true })
    document.addEventListener('selectionchange', scheduleSave)
    document.addEventListener('click', preserveBeforeNavigation, true)
    window.addEventListener('popstate', preserveBeforeHistoryNavigation)
    window.addEventListener('pagehide', save)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', scheduleSave)
      document.removeEventListener('selectionchange', scheduleSave)
      document.removeEventListener('click', preserveBeforeNavigation, true)
      window.removeEventListener('popstate', preserveBeforeHistoryNavigation)
      window.removeEventListener('pagehide', save)
    }
  }, [thoughtId])

  useEffect(() => {
    if (restoredId.current === thoughtId) return
    const saved = parseThoughtPosition(sessionStorage.getItem(thoughtPositionKey(thoughtId)))
    if (!saved || !savedPositionIsNewer(saved, fallbackCreatedAt)) {
      const frame = requestAnimationFrame(() => {
        if (fallbackElementId) document.getElementById(fallbackElementId)?.scrollIntoView({ block: 'center' })
        restoredId.current = thoughtId
      })
      return () => cancelAnimationFrame(frame)
    }
    let innerFrame = 0
    const frame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        window.scrollTo({ top: saved.scrollY })
        const textarea = textareaRef.current
        if (textarea) {
          const end = Math.min(saved.selectionEnd, content.length)
          textarea.setSelectionRange(Math.min(saved.selectionStart, end), end)
        }
        restoredId.current = thoughtId
      })
    })
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(innerFrame)
    }
  }, [content, fallbackCreatedAt, fallbackElementId, thoughtId])

  return textareaRef as RefObject<HTMLTextAreaElement | null>
}
