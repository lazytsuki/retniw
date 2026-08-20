'use client'

import type { AiAction } from '@/src/server/ai/deepseek-text-provider'

type AiActionsProps = {
  aiDisabled: boolean
  relationDisabled: boolean
  waitingForInput: boolean
  running: boolean
  onAction: (action: AiAction) => void
  relationRunning: boolean
  onRelation: () => void
}

const actions: Array<{ action: AiAction; label: string }> = [
  { action: 'advance', label: '推进' },
  { action: 'question', label: '追问' },
  { action: 'organize', label: '整理' },
]

export function AiActions({
  aiDisabled,
  relationDisabled,
  waitingForInput,
  running,
  onAction,
  relationRunning,
  onRelation,
}: AiActionsProps) {
  return (
    <div className="ai-action-area">
      <div className="ai-actions" aria-label="AI 操作">
        {actions.map(({ action, label }) => (
          <button
            type="button"
            disabled={aiDisabled || running}
            key={action}
            onClick={() => onAction(action)}
          >
            {label}
          </button>
        ))}
        <button type="button" disabled={relationDisabled || relationRunning} onClick={onRelation}>
          寻找联系
        </button>
      </div>
      {waitingForInput && <p className="ai-input-hint">写下新的内容后，可以继续。</p>}
    </div>
  )
}
