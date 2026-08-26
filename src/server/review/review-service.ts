import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'
import {
  DeepSeekTextProvider,
  type ExistingReviewPair,
  type ReviewCandidateSummary,
  type ReviewPairSuggestion,
  type ReviewSuggestion,
} from '@/src/server/ai/deepseek-text-provider'
import { EntryRepository } from '@/src/server/repositories/entry-repository'
import { ReviewPreferenceRepository } from '@/src/server/repositories/review-preference-repository'
import { ThoughtConnectionRepository } from '@/src/server/repositories/thought-connection-repository'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'

type ReviewEntry = {
  id: string
  thoughtId: string
  content: string
  createdAt: string
}

type ReviewServiceDependencies = {
  preferences: {
    get(userId: string): Promise<{ enabled: boolean; updatedAt: string | null }>
  }
  thoughts: {
    listReviewCorpus(userId: string): Promise<ReviewCandidateSummary[]>
    listReviewCandidates(
      userId: string,
      currentThoughtId: string,
      excludedThoughtIds: ReadonlySet<string>,
    ): Promise<ReviewCandidateSummary[]>
  }
  entries: {
    claimForReview(userId: string, thoughtId: string, entryId: string): Promise<ReviewEntry | null>
    firstUserEntry(userId: string, thoughtId: string): Promise<ReviewEntry | null>
  }
  connections: {
    listExistingPairs(userId: string, candidateThoughtIds: readonly string[]): Promise<ExistingReviewPair[]>
    listExistingTargets(userId: string, thoughtId: string): Promise<Set<string>>
    createCandidate(input: {
      userId: string
      currentThoughtId: string
      targetThoughtId: string
      currentEntryId: string
      targetEntryId: string
      rationale: string
    }): Promise<{ created: boolean }>
  }
  provider: {
    findConnectionPairs(
      candidates: ReviewCandidateSummary[],
      existingPairs: ExistingReviewPair[],
    ): Promise<ReviewPairSuggestion[]>
    findConnections(
      source: { content: string },
      candidates: ReviewCandidateSummary[],
    ): Promise<ReviewSuggestion[]>
  }
  log(event: string, code: string): void
}

export type SavedEntryReview = {
  userId: string
  thoughtId: string
  entryId: string
  processedThrough: string
}

export type ReviewProcessResult = {
  status: 'disabled' | 'already-claimed' | 'processed' | 'provider-failed'
  created: number
}

export type ExistingThoughtReviewResult = {
  status: 'disabled' | 'not-enough-content' | 'processed' | 'provider-failed' | 'persistence-failed'
  created: number
}

function errorCode(error: unknown) {
  return error instanceof ApiError ? error.code : 'UNKNOWN'
}

function defaultLog(event: string, code: string) {
  console.error('review_background_event', { event, code })
}

export class ReviewService {
  constructor(private readonly dependencies: ReviewServiceDependencies) {}

  static fromClient(client: SupabaseClient) {
    return new ReviewService({
      preferences: new ReviewPreferenceRepository(client),
      thoughts: new ThoughtRepository(client),
      entries: new EntryRepository(client),
      connections: new ThoughtConnectionRepository(client),
      provider: new DeepSeekTextProvider(),
      log: defaultLog,
    })
  }

  async processSavedEntry(input: SavedEntryReview): Promise<ReviewProcessResult> {
    const preference = await this.dependencies.preferences.get(input.userId)
    if (!preference.enabled) return { status: 'disabled', created: 0 }

    const source = await this.dependencies.entries.claimForReview(
      input.userId,
      input.thoughtId,
      input.entryId,
    )
    if (!source) return { status: 'already-claimed', created: 0 }

    const existingTargets = await this.dependencies.connections.listExistingTargets(
      input.userId,
      input.thoughtId,
    )
    const candidates = await this.dependencies.thoughts.listReviewCandidates(
      input.userId,
      input.thoughtId,
      existingTargets,
    )
    if (!candidates.length) return { status: 'processed', created: 0 }

    let suggestions: ReviewSuggestion[]
    try {
      suggestions = await this.dependencies.provider.findConnections(
        { content: source.content.slice(0, 2000) },
        candidates,
      )
    } catch (error) {
      this.dependencies.log('provider_failed', errorCode(error))
      return { status: 'provider-failed', created: 0 }
    }

    const allowedTargets = new Set(candidates.map((candidate) => candidate.id))
    let created = 0
    for (const suggestion of suggestions.slice(0, 3)) {
      if (!allowedTargets.has(suggestion.targetThoughtId)) continue
      try {
        const targetEntry = await this.dependencies.entries.firstUserEntry(
          input.userId,
          suggestion.targetThoughtId,
        )
        if (!targetEntry) continue
        const result = await this.dependencies.connections.createCandidate({
          userId: input.userId,
          currentThoughtId: input.thoughtId,
          targetThoughtId: suggestion.targetThoughtId,
          currentEntryId: source.id,
          targetEntryId: targetEntry.id,
          rationale: suggestion.rationale.slice(0, 300),
        })
        if (result.created) created += 1
      } catch (error) {
        this.dependencies.log('candidate_save_failed', errorCode(error))
      }
    }

    return { status: 'processed', created }
  }

  async scanExistingThoughts(userId: string): Promise<ExistingThoughtReviewResult> {
    const preference = await this.dependencies.preferences.get(userId)
    if (!preference.enabled) return { status: 'disabled', created: 0 }

    const candidates = await this.dependencies.thoughts.listReviewCorpus(userId)
    if (candidates.length < 2) return { status: 'not-enough-content', created: 0 }
    const existingPairs = await this.dependencies.connections.listExistingPairs(
      userId,
      candidates.map((candidate) => candidate.id),
    )

    let suggestions: ReviewPairSuggestion[]
    try {
      suggestions = await this.dependencies.provider.findConnectionPairs(candidates, existingPairs)
    } catch (error) {
      this.dependencies.log('provider_failed', errorCode(error))
      return { status: 'provider-failed', created: 0 }
    }

    const allowedIds = new Set(candidates.map((candidate) => candidate.id))
    const anchorIds = Array.from(new Set(suggestions.flatMap((suggestion) => [
      suggestion.sourceThoughtId,
      suggestion.targetThoughtId,
    ]))).filter((thoughtId) => allowedIds.has(thoughtId))
    const anchors = new Map((await Promise.all(anchorIds.map(async (thoughtId) => [
      thoughtId,
      await this.dependencies.entries.firstUserEntry(userId, thoughtId),
    ] as const))).filter((entry): entry is readonly [string, ReviewEntry] => entry[1] !== null))

    let created = 0
    let persistenceFailed = false
    for (const suggestion of suggestions.slice(0, 3)) {
      const sourceEntry = anchors.get(suggestion.sourceThoughtId)
      const targetEntry = anchors.get(suggestion.targetThoughtId)
      if (!sourceEntry || !targetEntry) continue
      try {
        const result = await this.dependencies.connections.createCandidate({
          userId,
          currentThoughtId: suggestion.sourceThoughtId,
          targetThoughtId: suggestion.targetThoughtId,
          currentEntryId: sourceEntry.id,
          targetEntryId: targetEntry.id,
          rationale: suggestion.rationale.slice(0, 300),
        })
        if (result.created) created += 1
      } catch (error) {
        persistenceFailed = true
        this.dependencies.log('candidate_save_failed', errorCode(error))
      }
    }

    return { status: persistenceFailed ? 'persistence-failed' : 'processed', created }
  }
}
