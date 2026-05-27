import type { VoiceNote } from '../types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface NotesListProps {
  notes: VoiceNote[]
  isLoading: boolean
  onSelect: (note: VoiceNote) => void
}

export function NotesList({ notes, isLoading, onSelect }: NotesListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (notes.length === 0) {
    return <p className="text-gray-400 py-8">还没有语音笔记，开始录音吧！</p>
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <button
          key={note.id}
          onClick={() => onSelect(note)}
          className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all"
        >
          <div className="flex justify-between items-start mb-1">
            <h3 className="font-medium text-gray-900 truncate flex-1">
              {note.title || note.content.slice(0, 20)}
            </h3>
            <span className="text-xs text-gray-400 ml-2 shrink-0">
              {formatDuration(note.duration)}
            </span>
          </div>
          <p className="text-sm text-gray-500 line-clamp-2">{note.content}</p>
          <p className="text-xs text-gray-400 mt-2">{formatDate(note.created_at)}</p>
        </button>
      ))}
    </div>
  )
}
