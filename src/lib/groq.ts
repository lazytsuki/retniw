export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.webm')
  formData.append('model', 'whisper-large-v3-turbo')
  formData.append('language', 'zh')
  formData.append('response_format', 'json')

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`转录失败: ${error}`)
  }

  const data = await response.json()
  return data.text
}
