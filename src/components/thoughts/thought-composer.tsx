'use client'

import type { RefObject } from 'react'

type ThoughtComposerProps = {
  content: string
  hasEntries: boolean
  onChange: (content: string) => void
  onSubmit: () => void
  textareaRef?: RefObject<HTMLTextAreaElement | null>
}

export function thoughtComposerCopy(hasEntries: boolean) {
  const text = hasEntries ? '接着写' : '写在这里'
  return { ariaLabel: text, placeholder: text }
}

export function shouldSubmitThought(event: {
  key: string
  shiftKey: boolean
  isComposing: boolean
  keyCode: number
}) {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229
}

export function ThoughtComposer({ content, hasEntries, onChange, onSubmit, textareaRef }: ThoughtComposerProps) {
  const copy = thoughtComposerCopy(hasEntries)
  return (
    <div className="thought-composer capture-surface">
      <textarea
        ref={textareaRef}
        autoFocus
        maxLength={10_000}
        aria-label={copy.ariaLabel}
        placeholder={copy.placeholder}
        value={content}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (!shouldSubmitThought({
            key: event.key,
            shiftKey: event.shiftKey,
            isComposing: event.nativeEvent.isComposing,
            keyCode: event.keyCode,
          })) return
          event.preventDefault()
          onSubmit()
        }}
      />
      <div className="capture-actions">
        <span>Enter 保存 · Shift+Enter 换行</span>
        <button type="button" aria-label="保存" disabled={!content.trim()} onClick={onSubmit}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 12 5-5 5 5M12 7v10" />
          </svg>
        </button>
      </div>
    </div>
  )
}
