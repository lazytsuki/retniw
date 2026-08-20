'use server'

import { redirect } from 'next/navigation'
import { createServerAuthClient } from '@/src/lib/supabase/server'

export async function login(formData: FormData) {
  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    redirect('/login?error=invalid')
  }

  const supabase = await createServerAuthClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) redirect('/login?error=invalid')

  redirect('/')
}
