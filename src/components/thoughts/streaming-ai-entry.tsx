'use client'

import type { AiActionState } from '@/src/hooks/use-ai-action'
import { aiOutputForDisplay } from '@/src/lib/ai-output'
import { EntryContent } from './entry-content'

const labels = {
  advance: '帮我接着想',
  question: '帮我接着想',
  organize: '整理结果',
}

export function StreamingAiEntry({ state, onClear }: { state: AiActionState; onClear: () => void }) {
  if (state.status === 'idle' || state.status === 'saved') return null
  const content = aiOutputForDisplay(state.content, state.action)

  return (
    <article className="thought-entry thought-entry--ai-live" aria-busy={state.status === 'streaming' || undefined}>
      <p className="visually-hidden" role="status">
        {state.status === 'error' ? '生成失败，结果没有保存' : '正在生成内容'}
      </p>
      <p className="entry-source entry-source--assist">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5v5a4 4 0 0 0 4 4h8" />
          <path d="m15 11 3 3-3 3" />
          <circle cx="6" cy="5" r="2" />
        </svg>
        {state.action ? labels[state.action] : ''}
      </p>
      {content ? <EntryContent content={content} markdown /> : <p className="ai-waiting">正在生成</p>}
      {state.status === 'error' && (
        <div className="ai-unsaved">
          <span>{state.message}</span>
          {content && (
            <button type="button" onClick={() => void navigator.clipboard.writeText(content)}>
              复制
            </button>
          )}
          <button type="button" onClick={onClear}>关闭</button>
        </div>
      )}
    </article>
  )
}
