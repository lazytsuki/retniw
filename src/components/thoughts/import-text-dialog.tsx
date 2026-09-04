'use client'

import { useEffect, useRef, useState } from 'react'
import { parseImportedText, validateImportedText } from '@/src/lib/import/parse-imported-text'

export type ImportSubmission = {
  content: string
  sourceLabel: string | null
  target: 'current' | 'new'
}

export type ImportRequestIds = {
  thoughtId: string
  entryId: string
  clientRequestId: string
}

function nextRequestIds(): ImportRequestIds {
  return {
    thoughtId: crypto.randomUUID(),
    entryId: crypto.randomUUID(),
    clientRequestId: crypto.randomUUID(),
  }
}

type ImportTextDialogProps = {
  open: boolean
  currentAllowed: boolean
  onClose: () => void
  onImport: (submission: ImportSubmission, requestIds: ImportRequestIds) => Promise<void>
}

const importDialogTitleId = 'import-dialog-title'
const importDialogDescriptionId = 'import-dialog-description'
const importFileInputId = 'import-file-input'

export function ImportTextDialog({ open, currentAllowed, onClose, onImport }: ImportTextDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const requestIdsRef = useRef<ImportRequestIds | null>(null)
  const savingRef = useRef(false)
  const [content, setContent] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [target, setTarget] = useState<'current' | 'new'>(currentAllowed ? 'current' : 'new')
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      window.requestAnimationFrame(() => contentRef.current?.focus({ preventScroll: true }))
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  function reset() {
    setContent('')
    setSourceLabel('')
    setTarget(currentAllowed ? 'current' : 'new')
    setFileName(null)
    setError('')
    requestIdsRef.current = null
  }

  function invalidateRequest() {
    requestIdsRef.current = null
  }

  function close() {
    if (savingRef.current) return
    reset()
    onClose()
  }

  async function submit() {
    if (savingRef.current) return
    setError('')
    try {
      validateImportedText(content)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '导入内容无效')
      return
    }
    savingRef.current = true
    setSaving(true)
    const requestIds = requestIdsRef.current ?? nextRequestIds()
    requestIdsRef.current = requestIds
    try {
      await onImport({
        content,
        sourceLabel: fileName ?? (sourceLabel.trim() || null),
        target,
      }, requestIds)
      reset()
      onClose()
    } catch {
      setError('导入结果未确认。保持原内容可安全重试；修改后会作为新的导入保存。')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <dialog
      className="import-dialog"
      ref={dialogRef}
      aria-labelledby={importDialogTitleId}
      aria-describedby={importDialogDescriptionId}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      onClose={() => {
        if (open) onClose()
      }}
    >
      <div className="import-dialog__header">
        <h2 id={importDialogTitleId}>导入文字</h2>
        <button
          type="button"
          aria-label={saving ? '正在导入，暂时无法关闭' : '关闭导入'}
          disabled={saving}
          onClick={close}
        >关闭</button>
      </div>
      <p id={importDialogDescriptionId} className="import-dialog__description">
        粘贴文字或选择文件，再决定导入到当前想法还是新想法。
      </p>

      <textarea
        autoFocus
        ref={contentRef}
        aria-label="要导入的文字"
        disabled={saving}
        placeholder="粘贴文字，或选择 .md、.txt 文件"
        value={content}
        onChange={(event) => {
          invalidateRequest()
          setContent(event.target.value)
          setFileName(null)
        }}
      />

      <div className="import-dialog__row">
        <label className="file-button" htmlFor={importFileInputId} aria-disabled={saving || undefined}>选择文件</label>
        <input
          id={importFileInputId}
          className="visually-hidden-file-input"
          type="file"
          disabled={saving}
          accept=".md,.txt,text/markdown,text/plain"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            setError('')
            try {
              const parsed = await parseImportedText(file)
              invalidateRequest()
              setContent(parsed.content)
              setFileName(parsed.sourceLabel)
              setSourceLabel('')
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : '无法读取文件')
            } finally {
              event.target.value = ''
            }
          }}
        />
        <span>{fileName ?? '支持 .md 和 .txt，不超过 1 MB'}</span>
      </div>

      {!fileName && (
        <label className="import-dialog__field">
          来源名称（可不填）
          <input
            disabled={saving}
            maxLength={255}
            value={sourceLabel}
            onChange={(event) => {
              invalidateRequest()
              setSourceLabel(event.target.value)
            }}
          />
        </label>
      )}

      <fieldset>
        <legend>导入到</legend>
        <label>
          <input
            type="radio"
            name="import-target"
            value="current"
            disabled={!currentAllowed || saving}
            checked={target === 'current'}
            onChange={() => {
              invalidateRequest()
              setTarget('current')
            }}
          />
          当前想法
        </label>
        <label>
          <input
            type="radio"
            name="import-target"
            value="new"
            disabled={saving}
            checked={target === 'new'}
            onChange={() => {
              invalidateRequest()
              setTarget('new')
            }}
          />
          新想法
        </label>
      </fieldset>

      {error && <p className="import-dialog__error" role="alert">{error}</p>}
      <button
        className="import-dialog__submit"
        type="button"
        disabled={saving || !content.trim()}
        onClick={() => void submit()}
      >
        {saving ? '正在导入' : '导入'}
      </button>
    </dialog>
  )
}
