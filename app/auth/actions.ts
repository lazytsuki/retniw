'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServerAuthClient } from '@/src/lib/supabase/server'

export async function logout(formData: FormData) {
  const supabase = await createServerAuthClient()
  const user = await requireUser(supabase).catch(() => null)
  if (!user) redirect('/login')
  if (formData.get('expectedUserId') !== user.id) redirect('/')
  await supabase.auth.signOut()
  redirect('/login')
}
