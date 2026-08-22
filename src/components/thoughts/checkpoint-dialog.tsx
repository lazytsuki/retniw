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
    if (saving) return
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
      setError('没有保存，可以重试。')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <dialog
      className="checkpoint-dialog"
      ref={dialogRef}
      onClick={(event) => { if (event.target === event.currentTarget) close() }}
      onCancel={(event) => { event.preventDefault(); close() }}
      onClose={() => open && !saving && overlay.close('checkpoint')}
    >
      <header><h2>先到这里</h2><button type="button" onClick={close}>关闭</button></header>
      <label>
        下次从哪里接着想？（可不填）
        <textarea autoFocus maxLength={500} placeholder="写一句提醒" value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={saving} onClick={() => void submit()}>{saving ? '正在保存' : '回到全部想法'}</button>
    </dialog>
  )
}
