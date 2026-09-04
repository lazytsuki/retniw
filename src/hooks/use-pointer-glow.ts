'use client'

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

type PointerGlowTarget = HTMLElement & {
  dataset: DOMStringMap & { pointerGlowActive?: string }
}

export function usePointerGlow<T extends PointerGlowTarget>(enabled = true) {
  const frameRef = useRef<number | null>(null)
  const pendingRef = useRef<{ element: T; x: number; y: number } | null>(null)

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    if (!enabled || event.pointerType === 'touch') return
    if (!window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return

    const element = event.currentTarget
    const bounds = element.getBoundingClientRect()
    pendingRef.current = {
      element,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    }
    element.dataset.pointerGlowActive = 'true'

    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      const pending = pendingRef.current
      if (!pending) return
      pending.element.style.setProperty('--pointer-glow-x', `${pending.x}px`)
      pending.element.style.setProperty('--pointer-glow-y', `${pending.y}px`)
    })
  }, [enabled])

  const onPointerLeave = useCallback((event: ReactPointerEvent<T>) => {
    event.currentTarget.dataset.pointerGlowActive = 'false'
    pendingRef.current = null
  }, [])

  return { onPointerLeave, onPointerMove }
}
