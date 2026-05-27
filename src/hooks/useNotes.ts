import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { VoiceNote } from '../types'

export function useNotes() {
  const [notes, setNotes] = useState<VoiceNote[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchNotes = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('voice_notes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch notes:', error)
    } else {
      setNotes(data ?? [])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const saveNote = useCallback(
    async (content: string, duration: number) => {
      const title = content.length > 20 ? content.slice(0, 20) + '...' : content

      const { data, error } = await supabase
        .from('voice_notes')
        .insert({ title, content, duration })
        .select()
        .single()

      if (error) throw error
      setNotes((prev) => [data, ...prev])
      return data as VoiceNote
    },
    []
  )

  const deleteNote = useCallback(async (id: string) => {
    const { error } = await supabase.from('voice_notes').delete().eq('id', id)
    if (error) throw error
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  return { notes, isLoading, fetchNotes, saveNote, deleteNote }
}
