'use client'

import { useState } from 'react'
import { expectedUserIdQuery, userBoundFetch } from '@/src/lib/auth/user-bound-fetch'

export function ExportMenu({ thoughtId, userId }: { thoughtId: string | null; userId: string }) {
  const [status, setStatus] = useState('')

  async function download(href: string) {
    setStatus('正在准备下载')
    try {
      const response = await userBoundFetch(userId, href, { method: 'HEAD' })
      if (!response.ok) throw new Error('EXPORT_FAILED')

      const downloadUrl = new URL(href, window.location.href)
      downloadUrl.searchParams.set(expectedUserIdQuery, userId)
      const frame = document.createElement('iframe')
      frame.hidden = true
      frame.src = downloadUrl.toString()
      document.body.append(frame)
      window.setTimeout(() => frame.remove(), 60_000)
      setStatus('下载已开始')
    } catch {
      setStatus('没有导出，请刷新后重试')
    }
    window.setTimeout(() => setStatus(''), 2500)
  }

  return (
    <div className="export-menu">
      {thoughtId && (
        <button
          type="button"
          aria-label="导出当前想法为 Markdown"
          role="menuitem"
          onClick={() => void download(`/api/thoughts/${thoughtId}/export.md`)}
        >
          导出这个想法
        </button>
      )}
      <button type="button" aria-label="导出全部想法为 JSON" role="menuitem" onClick={() => void download('/api/export')}>导出全部想法</button>
      {status && <span role="status">{status}</span>}
    </div>
  )
}
