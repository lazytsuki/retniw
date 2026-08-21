'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

type OverlayContextValue = {
  activeId: string | null
  open: (id: string, trigger?: HTMLElement | null) => void
  close: (id?: string) => void
  isOpen: (id: string) => boolean
}

const OverlayContext = createContext<OverlayContextValue | null>(null)

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const close = useCallback((id?: string) => {
    setActiveId((current) => {
      if (id && current !== id) return current
      queueMicrotask(() => triggerRef.current?.isConnected && triggerRef.current.focus())
      triggerRef.current = null
      return null
    })
  }, [])

  const open = useCallback((id: string, trigger?: HTMLElement | null) => {
    triggerRef.current = trigger ?? null
    setActiveId(id)
  }, [])

  const value = useMemo<OverlayContextValue>(() => ({
    activeId,
    open,
    close,
    isOpen: (id) => activeId === id,
  }), [activeId, close, open])

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
}

export function useOverlayController() {
  const context = useContext(OverlayContext)
  if (!context) throw new Error('useOverlayController must be used inside OverlayProvider')
  return context
}

export function useDismissibleLayer(
  id: string,
  layerRef: RefObject<HTMLElement | null>,
) {
  const overlay = useOverlayController()
  useEffect(() => {
    if (!overlay.isOpen(id)) return
    const dismissOutside = (event: PointerEvent) => {
      if (layerRef.current?.contains(event.target as Node)) return
      overlay.close(id)
    }
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') overlay.close(id)
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('keydown', dismissEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('keydown', dismissEscape)
    }
  }, [id, layerRef, overlay])
}
