import { redirect } from 'next/navigation'
import { ApiError } from '@/src/lib/api-error'
import { requireUser } from '@/src/lib/auth/require-user'
import { AccountCreatedTransition } from './account-created-transition'

export const dynamic = 'force-dynamic'

export default async function AccountCreatedPage() {
  try {
    await requireUser()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/login')
    throw error
  }

  return <AccountCreatedTransition />
}
