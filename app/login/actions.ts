'use server'

import { redirect } from 'next/navigation'
import { parseLoginCredentials, parseSignupCredentials } from '@/src/lib/auth/credentials'
import { createServerAuthClient } from '@/src/lib/supabase/server'

export async function login(formData: FormData) {
  const credentials = parseLoginCredentials(formData)
  if (!credentials.ok) {
    redirect('/login?error=invalid')
  }

  const supabase = await createServerAuthClient()
  const { error } = await supabase.auth.signInWithPassword(credentials.value)

  if (error) redirect('/login?error=invalid')

  redirect('/')
}

export async function signup(formData: FormData) {
  const credentials = parseSignupCredentials(formData)
  if (!credentials.ok) {
    redirect(`/login?mode=signup&error=${credentials.error}`)
  }

  const supabase = await createServerAuthClient()
  const { data, error } = await supabase.auth.signUp(credentials.value)

  if (error || !data.user) redirect('/login?mode=signup&error=signup-failed')
  if (data.session) redirect('/auth/created')

  redirect('/login?notice=check-email')
}
