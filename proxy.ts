import type { NextRequest } from 'next/server'
import { updateSession } from '@/src/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|icon-192.svg|icon-512.svg|sw.js|offline).*)',
  ],
}
