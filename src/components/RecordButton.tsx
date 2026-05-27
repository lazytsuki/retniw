interface RecordButtonProps {
  isRecording: boolean
  onStart: () => void
  onStop: () => void
  disabled?: boolean
}

export function RecordButton({ isRecording, onStart, onStop, disabled }: RecordButtonProps) {
  return (
    <button
      onClick={isRecording ? onStop : onStart}
      disabled={disabled}
      className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
        disabled
          ? 'bg-gray-300 cursor-not-allowed'
          : isRecording
            ? 'bg-red-600 hover:bg-red-700 animate-pulse'
            : 'bg-red-500 hover:bg-red-600'
      }`}
    >
      {isRecording ? (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
          <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4Z" />
          <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18.5V23M8 23h8" stroke="white" strokeWidth="1.5" fill="none" />
        </svg>
      )}
    </button>
  )
}
