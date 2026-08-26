'use client'

import Link from 'next/link'

type ThinkingAssistProps = {
  disabled: boolean
  waitingForInput: boolean
  running: boolean
  onContinue: () => void
}

export function ThinkingAssist({ disabled, waitingForInput, running, onContinue }: ThinkingAssistProps) {
  return (
    <div className="thinking-assist">
      <button type="button" disabled={disabled || running} onClick={onContinue}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5v5a4 4 0 0 0 4 4h8" />
          <path d="m15 11 3 3-3 3" />
          <circle cx="6" cy="5" r="2" />
        </svg>
        {running ? '正在生成' : '帮我接着想'}
      </button>
      <Link href="/review">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6" cy="8" r="2.5" />
          <circle cx="18" cy="16" r="2.5" />
          <path d="M8.4 9.2 15.6 14.8" />
        </svg>
        串联已有想法
      </Link>
      {waitingForInput && <p>写一点新的内容后，可以再用一次。</p>}
    </div>
  )
}
