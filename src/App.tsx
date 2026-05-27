import { useState, useEffect, useRef } from 'react'
import { useAudioRecorder } from './hooks/useAudioRecorder'
import { useNotes } from './hooks/useNotes'
import { transcribeAudio } from './lib/groq'
import { RecordButton } from './components/RecordButton'
import { RecordingIndicator } from './components/RecordingIndicator'
import { NotesList } from './components/NotesList'
import { NoteDetail } from './components/NoteDetail'
import type { VoiceNote } from './types'

export default function App() {
  const { isRecording, duration, audioBlob, startRecording, stopRecording, resetRecording } =
    useAudioRecorder()
  const { notes, isLoading, saveNote, deleteNote } = useNotes()

  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null)
  const processingRef = useRef(false)

  useEffect(() => {
    if (!audioBlob || processingRef.current) return
    processingRef.current = true

    async function process(blob: Blob) {
      setIsTranscribing(true)
      setError(null)
      try {
        if (blob.size > 25 * 1024 * 1024) {
          throw new Error('录音文件过大（超过 25MB）')
        }
        const text = await transcribeAudio(blob)
        await saveNote(text, duration)
      } catch (err) {
        setError(err instanceof Error ? err.message : '转录失败')
      } finally {
        setIsTranscribing(false)
        resetRecording()
        processingRef.current = false
      }
    }

    process(audioBlob)
  }, [audioBlob, duration, saveNote, resetRecording])

  const handleDelete = async (id: string) => {
    await deleteNote(id)
    setSelectedNote(null)
  }

  if (selectedNote) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-lg mx-auto px-4 py-8">
          <NoteDetail note={selectedNote} onBack={() => setSelectedNote(null)} onDelete={handleDelete} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-8">语音笔记</h1>

        <div className="flex flex-col items-center gap-4 mb-10">
          <RecordingIndicator
            isRecording={isRecording}
            duration={duration}
            isTranscribing={isTranscribing}
          />
          <RecordButton
            isRecording={isRecording}
            onStart={startRecording}
            onStop={stopRecording}
            disabled={isTranscribing}
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <h2 className="text-lg font-semibold text-gray-700 mb-4">最近笔记</h2>
        <NotesList notes={notes} isLoading={isLoading} onSelect={setSelectedNote} />
      </div>
    </div>
  )
}
