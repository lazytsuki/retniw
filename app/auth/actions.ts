'use server'

import { redirect } from 'next/navigation'
import { createServerAuthClient } from '@/src/lib/supabase/server'

export async function logout() {
  const supabase = await createServerAuthClient()
  await supabase.auth.signOut()
  redirect('/login')
}
