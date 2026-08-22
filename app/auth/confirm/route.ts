import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerAuthClient } from '@/src/lib/supabase/server'

export const runtime = 'nodejs'

function isSignupConfirmationType(value: string | null): value is EmailOtpType {
  return value === 'email' || value === 'signup'
}
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type')
  const redirectTo = request.nextUrl.clone()
  redirectTo.pathname = '/'
  redirectTo.search = ''

  if (tokenHash && isSignupConfirmationType(type)) {
    const supabase = await createServerAuthClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) return NextResponse.redirect(redirectTo)
  }

  redirectTo.pathname = '/login'
  redirectTo.searchParams.set('error', 'confirm-failed')
  return NextResponse.redirect(redirectTo)
}
