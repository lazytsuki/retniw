'use client'

import { useEffect, useRef, useState } from 'react'
import { useOverlayController } from '@/src/components/overlay-provider'

export function CheckpointDialog({ open, onSave }: {
  open: boolean
  onSave: (note: string) => Promise<void>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const overlay = useOverlayController()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  function close() {
    if (saving) return
    setNote('')
    setError('')
    overlay.close('checkpoint')
  }

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await onSave(note.trim())
      setNote('')
      overlay.close('checkpoint')
    } catch {
      setError('没有保存，可以重试。')
    } finally {
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
        留一句（可不填）
        <textarea autoFocus maxLength={500} placeholder="下次从哪里接着想" value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={saving} onClick={() => void submit()}>{saving ? '正在保存' : '先到这里'}</button>
    </dialog>
  )
}
