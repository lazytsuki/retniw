'use client'

import { useRef } from 'react'
import { ExportMenu } from './export-menu'

type ThoughtMenuProps = {
  thoughtId: string | null
  organizeDisabled: boolean
  organizeRunning: boolean
  onImport: () => void
  onOrganize: () => void
}

export function ThoughtMenu({
  thoughtId,
  organizeDisabled,
  organizeRunning,
  onImport,
  onOrganize,
}: ThoughtMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  function closeMenu() {
    if (detailsRef.current) detailsRef.current.open = false
  }

  return (
    <details className="thought-menu" ref={detailsRef}>
      <summary aria-label="更多操作">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.25" />
          <circle cx="12" cy="12" r="1.25" />
          <circle cx="19" cy="12" r="1.25" />
        </svg>
      </summary>
      <div className="thought-menu__panel">
        <button
          type="button"
          disabled={!thoughtId || organizeDisabled || organizeRunning}
          onClick={() => {
            closeMenu()
            onOrganize()
          }}
        >
          {organizeRunning ? '正在整理' : '整理内容'}
        </button>
        <button
          type="button"
          onClick={() => {
            closeMenu()
            onImport()
          }}
        >
          导入文字
        </button>
        <ExportMenu thoughtId={thoughtId} />
      </div>
    </details>
  )
}
