'use client'

import { useEffect, useRef, useState } from 'react'
import { useOverlayController } from '@/src/components/overlay-provider'

type CheckpointRequestIds = { entryId: string; clientRequestId: string }

function nextRequestIds(): CheckpointRequestIds {
  return { entryId: crypto.randomUUID(), clientRequestId: crypto.randomUUID() }
}

export function CheckpointDialog({ open, onSave }: {
  open: boolean
  onSave: (note: string, requestIds: CheckpointRequestIds) => Promise<void>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const requestIdsRef = useRef<CheckpointRequestIds | null>(null)
  const savingRef = useRef(false)
  const overlay = useOverlayController()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      requestIdsRef.current ??= nextRequestIds()
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  function close() {
    if (savingRef.current) return
    setNote('')
    setError('')
    requestIdsRef.current = null
    overlay.close('checkpoint')
  }

  async function submit() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    const requestIds = requestIdsRef.current ?? nextRequestIds()
    requestIdsRef.current = requestIds
    try {
      await onSave(note.trim(), requestIds)
      setNote('')
      requestIdsRef.current = null
      overlay.close('checkpoint')
    } catch {
      setError('保存结果未确认。保持原内容可安全重试；修改后会作为新的检查点保存。')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <dialog
      className="checkpoint-dialog"
      ref={dialogRef}
      aria-labelledby="checkpoint-dialog-title"
      aria-describedby="checkpoint-dialog-description"
      onClick={(event) => { if (event.target === event.currentTarget) close() }}
      onCancel={(event) => { event.preventDefault(); close() }}
      onClose={() => open && overlay.close('checkpoint')}
    >
      <header>
        <h2 id="checkpoint-dialog-title">先到这里</h2>
        <button type="button" aria-label={saving ? '正在保存，暂时无法关闭' : '关闭检查点'} disabled={saving} onClick={close}>关闭</button>
      </header>
      <p id="checkpoint-dialog-description">保存一个检查点，然后回到全部想法。</p>
      <label>
        下次从哪里接着想？（可不填）
        <textarea
          autoFocus
          disabled={saving}
          maxLength={500}
          placeholder="写一句提醒"
          value={note}
          onChange={(event) => {
            requestIdsRef.current = null
            setNote(event.target.value)
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={saving} onClick={() => void submit()}>{saving ? '正在保存' : '回到全部想法'}</button>
    </dialog>
  )
}
