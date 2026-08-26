'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type WorkspaceSidebarState = {
  collapsed: boolean
  collapse: () => void
  expand: () => void
}

const WorkspaceSidebarContext = createContext<WorkspaceSidebarState | null>(null)

export function WorkspaceSidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const value = useMemo<WorkspaceSidebarState>(() => ({
    collapsed,
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
  }), [collapsed])

  return (
    <WorkspaceSidebarContext.Provider value={value}>
      {children}
    </WorkspaceSidebarContext.Provider>
  )
}

export function useWorkspaceSidebar() {
  const value = useContext(WorkspaceSidebarContext)
  if (!value) throw new Error('useWorkspaceSidebar must be used inside WorkspaceSidebarProvider')
  return value
}
