import { after } from 'next/server'
import { ApiError } from '@/src/lib/api-error'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ReviewService, type SavedEntryReview } from './review-service'

function errorCode(error: unknown) {
  return error instanceof ApiError ? error.code : 'UNKNOWN'
}

export function scheduleSavedEntryReview(input: SavedEntryReview) {
  try {
    after(async () => {
      try {
        await ReviewService.fromClient(createServiceClient()).processSavedEntry(input)
      } catch (error) {
        console.error('review_background_event', {
          event: 'callback_failed',
          code: errorCode(error),
        })
      }
    })
  } catch (error) {
    console.error('review_background_event', {
      event: 'registration_failed',
      code: errorCode(error),
    })
  }
}
