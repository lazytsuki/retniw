function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface RecordingIndicatorProps {
  isRecording: boolean
  duration: number
  isTranscribing: boolean
}

export function RecordingIndicator({ isRecording, duration, isTranscribing }: RecordingIndicatorProps) {
  if (isTranscribing) {
    return (
      <div className="flex items-center gap-2 text-gray-600">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
        </svg>
        <span>转录中...</span>
      </div>
    )
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <span className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
        <span>录音中...</span>
        <span className="font-mono text-lg">{formatDuration(duration)}</span>
      </div>
    )
  }

  return <p className="text-gray-400 text-sm">点击下方按钮开始录音</p>
}
