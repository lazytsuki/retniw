'use client'

import { useState } from 'react'

export function EntryActions({ content }: { content: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  return (
    <button
      className="entry-copy"
      type="button"
      aria-label={status === 'copied' ? '已复制此段' : status === 'failed' ? '复制失败，请重试' : '复制此段'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(content)
          setStatus('copied')
        } catch {
          setStatus('failed')
        }
        window.setTimeout(() => setStatus('idle'), 1600)
      }}
    >
      {status === 'copied' ? '已复制' : status === 'failed' ? '复制失败' : '复制'}
    </button>
  )
}
