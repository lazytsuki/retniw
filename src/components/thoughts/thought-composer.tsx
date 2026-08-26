'use client'

import { useId, type RefObject } from 'react'

type ThoughtComposerProps = {
  autoFocus?: boolean
  content: string
  hasEntries: boolean
  onChange: (content: string) => void
  onSubmit: () => void
  textareaRef?: RefObject<HTMLTextAreaElement | null>
}

export function thoughtComposerCopy(hasEntries: boolean) {
  return hasEntries
    ? { ariaLabel: '继续写', placeholder: '补充一个新的点，或继续刚才的思路' }
    : { ariaLabel: '写在这里', placeholder: '从这里开始写' }
}

export function shouldSubmitThought(event: {
  key: string
  shiftKey: boolean
  isComposing: boolean
  keyCode: number
}, coarsePointer = false) {
  return event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    event.keyCode !== 229 &&
    !coarsePointer
}

export function ThoughtComposer({ autoFocus = false, content, hasEntries, onChange, onSubmit, textareaRef }: ThoughtComposerProps) {
  const copy = thoughtComposerCopy(hasEntries)
  const textareaId = useId()
  return (
    <div
      className={`thought-composer capture-surface${hasEntries ? '' : ' thought-composer--initial'}`}
      data-mode={hasEntries ? 'continuation' : 'initial'}
    >
      {hasEntries && <label className="thought-composer__label" htmlFor={textareaId}>继续写</label>}
      <textarea
        id={textareaId}
        ref={textareaRef}
        autoFocus={autoFocus}
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
          }, window.matchMedia('(pointer: coarse)').matches)) return
          event.preventDefault()
          onSubmit()
        }}
      />
      <div className="capture-actions">
        <span className="capture-shortcut-hint">Enter 保存 · Shift+Enter 换行</span>
        <span className="capture-mobile-hint">换行继续写，点箭头保存</span>
        <button type="button" aria-label="保存" disabled={!content.trim()} onClick={onSubmit}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 12 5-5 5 5M12 7v10" />
          </svg>
        </button>
      </div>
    </div>
  )
}
