'use client'

import { useRef } from 'react'
import { ExportMenu } from './export-menu'
import { useDismissibleLayer, useOverlayController } from '@/src/components/overlay-provider'

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
  const menuRef = useRef<HTMLDivElement>(null)
  const overlay = useOverlayController()
  const menuOpen = overlay.isOpen('thought-menu')
  useDismissibleLayer('thought-menu', menuRef)

  function closeMenu() {
    overlay.close('thought-menu')
  }

  return (
    <div className="thought-menu" ref={menuRef}>
      <button
        type="button"
        aria-label="更多操作"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={(event) => menuOpen
          ? overlay.close('thought-menu')
          : overlay.open('thought-menu', event.currentTarget)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.25" />
          <circle cx="12" cy="12" r="1.25" />
          <circle cx="19" cy="12" r="1.25" />
        </svg>
      </button>
      {menuOpen && <div className="thought-menu__panel" role="menu">
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
      </div>}
    </div>
  )
}
