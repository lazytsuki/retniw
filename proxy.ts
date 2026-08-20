import type { NextRequest } from 'next/server'
import { updateSession } from '@/src/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.png|icon-192.png|icon-512.png|curry-dog-avatar.png|sw.js|offline).*)',
  ],
}
