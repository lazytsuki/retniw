import { apiErrorResponse } from '@/src/lib/api-response'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { createFullExportStream } from '@/src/server/exports/export-streams'
import { ThoughtExportRepository } from '@/src/server/repositories/thought-export-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireUser()
    const stream = createFullExportStream(new ThoughtExportRepository(createServiceClient()), user.id)
    const date = new Date().toISOString().slice(0, 10)
    return new Response(stream, {
      headers: {
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="retniw-${date}.json"`,
        'content-type': 'application/json; charset=utf-8',
      },
    })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
