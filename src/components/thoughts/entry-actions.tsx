'use client'

import { useState } from 'react'

export function EntryActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      className="entry-copy"
      type="button"
      aria-label="复制此段"
      onClick={async () => {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? '已复制' : '复制'}
    </button>
  )
}
