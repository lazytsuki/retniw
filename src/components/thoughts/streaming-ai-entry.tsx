'use client'

import type { AiActionState } from '@/src/hooks/use-ai-action'
import { EntryContent } from './entry-content'

const labels = { advance: '推进', question: '追问', organize: '整理' }

export function StreamingAiEntry({ state, onClear }: { state: AiActionState; onClear: () => void }) {
  if (state.status === 'idle' || state.status === 'saved') return null

  return (
    <article className="thought-entry thought-entry--ai-live" aria-live="polite">
      <p className="entry-source">AI · {state.action ? labels[state.action] : ''}</p>
      {state.content ? <EntryContent content={state.content} markdown /> : <p className="ai-waiting">正在处理</p>}
      {state.status === 'error' && (
        <div className="ai-unsaved">
          <span>{state.message}</span>
          {state.content && (
            <button type="button" onClick={() => void navigator.clipboard.writeText(state.content)}>
              复制
            </button>
          )}
          <button type="button" onClick={onClear}>关闭</button>
        </div>
      )}
    </article>
  )
}
