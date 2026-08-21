'use client'

import { useEffect, useRef, useState } from 'react'
import { parseImportedText, validateImportedText } from '@/src/lib/import/parse-imported-text'

export type ImportSubmission = {
  content: string
  sourceLabel: string | null
  target: 'current' | 'new'
}

type ImportTextDialogProps = {
  open: boolean
  currentAllowed: boolean
  onClose: () => void
  onImport: (submission: ImportSubmission) => Promise<void>
}

export function ImportTextDialog({ open, currentAllowed, onClose, onImport }: ImportTextDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [content, setContent] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [target, setTarget] = useState<'current' | 'new'>(currentAllowed ? 'current' : 'new')
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  function reset() {
    setContent('')
    setSourceLabel('')
    setTarget(currentAllowed ? 'current' : 'new')
    setFileName(null)
    setError('')
  }

  function close() {
    if (saving) return
    reset()
    onClose()
  }

  async function submit() {
    setError('')
    try {
      validateImportedText(content)
      setSaving(true)
      await onImport({
        content,
        sourceLabel: fileName ?? (sourceLabel.trim() || null),
        target,
      })
      reset()
      onClose()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '导入失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      className="import-dialog"
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      onClose={() => {
        if (open && !saving) onClose()
      }}
    >
      <div className="import-dialog__header">
        <h2>导入文字</h2>
        <button type="button" aria-label="关闭导入" onClick={close}>关闭</button>
      </div>

      <textarea
        aria-label="要导入的文字"
        placeholder="粘贴文字，或选择 .md、.txt 文件"
        value={content}
        onChange={(event) => {
          setContent(event.target.value)
          setFileName(null)
        }}
      />

      <div className="import-dialog__row">
        <label className="file-button">
          选择文件
          <input
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              setError('')
              try {
                const parsed = await parseImportedText(file)
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
        </label>
        <span>{fileName ?? '支持 .md 和 .txt，不超过 1 MB'}</span>
      </div>

      {!fileName && (
        <label className="import-dialog__field">
          来源名称（可不填）
          <input
            maxLength={255}
            value={sourceLabel}
            onChange={(event) => setSourceLabel(event.target.value)}
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
            disabled={!currentAllowed}
            checked={target === 'current'}
            onChange={() => setTarget('current')}
          />
          当前想法
        </label>
        <label>
          <input
            type="radio"
            name="import-target"
            value="new"
            checked={target === 'new'}
            onChange={() => setTarget('new')}
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
