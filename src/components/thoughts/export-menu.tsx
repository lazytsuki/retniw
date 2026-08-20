'use client'

import { useState } from 'react'

export function ExportMenu({ thoughtId }: { thoughtId: string | null }) {
  const [status, setStatus] = useState('')

  function downloading() {
    setStatus('正在下载')
    window.setTimeout(() => setStatus(''), 1800)
  }

  return (
    <div className="export-menu">
      {thoughtId && (
        <a href={`/api/thoughts/${thoughtId}/export.md`} download onClick={downloading}>
          导出当前过程
        </a>
      )}
      <a href="/api/export" download onClick={downloading}>导出全部</a>
      {status && <span role="status">{status}</span>}
    </div>
  )
}
