'use client'

import type { ReactNode } from 'react'
import { useWorkspaceSidebar } from '@/src/components/workspace-sidebar-provider'

type ThoughtLayoutProps = {
  children: ReactNode
  className?: string
}

export function ThoughtLayout({ children, className = '' }: ThoughtLayoutProps) {
  const { collapsed } = useWorkspaceSidebar()
  const classes = [
    'thought-layout',
    collapsed ? 'thought-layout--sidebar-collapsed' : '',
    className,
  ].filter(Boolean).join(' ')

  return <div className={classes}>{children}</div>
}
