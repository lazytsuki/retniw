import type { VoiceNote } from '../types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}分${s}秒`
}

interface NoteDetailProps {
  note: VoiceNote
  onBack: () => void
  onDelete: (id: string) => void
}

export function NoteDetail({ note, onBack, onDelete }: NoteDetailProps) {
  const handleDelete = () => {
    if (window.confirm('确定要删除这条笔记吗？')) {
      onDelete(note.id)
    }
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        返回
      </button>

      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        {note.title || '语音笔记'}
      </h2>

      <div className="flex gap-4 text-sm text-gray-400 mb-6">
        <span>{formatDate(note.created_at)}</span>
        <span>{formatDuration(note.duration)}</span>
      </div>

      <div className="bg-gray-50 rounded-lg p-6 mb-8">
        <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{note.content}</p>
      </div>

      <button
        onClick={handleDelete}
        className="text-red-500 hover:text-red-700 text-sm transition-colors"
      >
        删除笔记
      </button>
    </div>
  )
}
