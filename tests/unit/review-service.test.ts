import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewService } from '@/src/server/review/review-service'

const ids = {
  user: '018f6f3a-a1c2-47a8-8f1e-a00000000001',
  thought: '018f6f3a-a1c2-47a8-8f1e-a00000000002',
  entry: '018f6f3a-a1c2-47a8-8f1e-a00000000003',
  firstTarget: '018f6f3a-a1c2-47a8-8f1e-a00000000004',
  firstTargetEntry: '018f6f3a-a1c2-47a8-8f1e-a00000000005',
  secondTarget: '018f6f3a-a1c2-47a8-8f1e-a00000000006',
  secondTargetEntry: '018f6f3a-a1c2-47a8-8f1e-a00000000007',
}

const processedThrough = '2026-08-24T01:00:00.000Z'

function dependencies() {
  const preferences = {
    get: vi.fn().mockResolvedValue({ enabled: true, updatedAt: processedThrough }),
  }
  const thoughts = {
    listReviewCorpus: vi.fn().mockResolvedValue([
      { id: ids.firstTarget, summary: '旧摘要一' },
      { id: ids.secondTarget, summary: '旧摘要二' },
    ]),
    listReviewCandidates: vi.fn().mockResolvedValue([
      { id: ids.firstTarget, summary: '旧摘要一' },
      { id: ids.secondTarget, summary: '旧摘要二' },
    ]),
  }
  const entries = {
    claimForReview: vi.fn().mockResolvedValue({
      id: ids.entry,
      thoughtId: ids.thought,
      entryType: 'user',
      content: '这次写下的内容',
      createdAt: processedThrough,
    }),
    firstUserEntry: vi.fn().mockImplementation(async (_userId: string, thoughtId: string) => ({
      id: thoughtId === ids.firstTarget ? ids.firstTargetEntry : ids.secondTargetEntry,
      thoughtId,
      entryType: 'user',
      content: '目标原文',
      createdAt: '2026-08-23T01:00:00.000Z',
    })),
  }
  const connections = {
    listExistingPairs: vi.fn().mockResolvedValue([]),
    listExistingTargets: vi.fn().mockResolvedValue(new Set<string>()),
    createCandidate: vi.fn().mockResolvedValue({ connection: {}, created: true }),
  }
  const provider = {
    findConnectionPairs: vi.fn().mockResolvedValue([
      {
        sourceThoughtId: ids.firstTarget,
        targetThoughtId: ids.secondTarget,
        rationale: '两条旧想法都在处理同一个取舍',
      },
    ]),
    findConnections: vi.fn().mockResolvedValue([
      { targetThoughtId: ids.firstTarget, rationale: '两段内容都在追问同一件事' },
      { targetThoughtId: ids.secondTarget, rationale: '前后的取舍可以放在一起看' },
    ]),
  }
  const log = vi.fn()
  return { preferences, thoughts, entries, connections, provider, log }
}

const input = {
  userId: ids.user,
  thoughtId: ids.thought,
  entryId: ids.entry,
  processedThrough,
}

describe('ReviewService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stops at the default-off preference without reading content or calling DeepSeek', async () => {
    const deps = dependencies()
    deps.preferences.get.mockResolvedValue({ enabled: false, updatedAt: null })

    await expect(new ReviewService(deps).processSavedEntry(input)).resolves.toEqual({
      status: 'disabled',
      created: 0,
    })

    expect(deps.entries.claimForReview).not.toHaveBeenCalled()
    expect(deps.connections.listExistingTargets).not.toHaveBeenCalled()
    expect(deps.thoughts.listReviewCandidates).not.toHaveBeenCalled()
    expect(deps.provider.findConnections).not.toHaveBeenCalled()
  })

  it('claims the exact entry before any history read and skips a replay of that entry', async () => {
    const deps = dependencies()
    deps.entries.claimForReview.mockResolvedValue(null)

    await expect(new ReviewService(deps).processSavedEntry(input)).resolves.toEqual({
      status: 'already-claimed',
      created: 0,
    })

    expect(deps.entries.claimForReview).toHaveBeenCalledWith(
      ids.user,
      ids.thought,
      ids.entry,
    )
    expect(deps.thoughts.listReviewCandidates).not.toHaveBeenCalled()
    expect(deps.provider.findConnections).not.toHaveBeenCalled()
  })

  it('uses only the saved entry, excludes existing pairs and persists anchored candidates', async () => {
    const deps = dependencies()
    deps.connections.listExistingTargets.mockResolvedValue(new Set([ids.secondTarget]))
    deps.thoughts.listReviewCandidates.mockResolvedValue([
      { id: ids.firstTarget, summary: '旧摘要一' },
    ])
    deps.provider.findConnections.mockResolvedValue([
      { targetThoughtId: ids.firstTarget, rationale: '两段内容都在追问同一件事' },
    ])

    await expect(new ReviewService(deps).processSavedEntry(input)).resolves.toEqual({
      status: 'processed',
      created: 1,
    })

    expect(deps.connections.listExistingTargets).toHaveBeenCalledWith(ids.user, ids.thought)
    expect(deps.thoughts.listReviewCandidates).toHaveBeenCalledWith(
      ids.user,
      ids.thought,
      new Set([ids.secondTarget]),
    )
    expect(deps.provider.findConnections).toHaveBeenCalledWith(
      { content: '这次写下的内容' },
      [{ id: ids.firstTarget, summary: '旧摘要一' }],
    )
    expect(deps.entries.firstUserEntry).toHaveBeenCalledWith(ids.user, ids.firstTarget)
    expect(deps.connections.createCandidate).toHaveBeenCalledWith({
      userId: ids.user,
      currentThoughtId: ids.thought,
      targetThoughtId: ids.firstTarget,
      currentEntryId: ids.entry,
      targetEntryId: ids.firstTargetEntry,
      rationale: '两段内容都在追问同一件事',
    })
  })

  it('turns provider failure into a safe background result without logging source text', async () => {
    const deps = dependencies()
    deps.provider.findConnections.mockRejectedValue(new Error('供应商返回了：私密正文'))

    await expect(new ReviewService(deps).processSavedEntry(input)).resolves.toEqual({
      status: 'provider-failed',
      created: 0,
    })

    expect(deps.connections.createCandidate).not.toHaveBeenCalled()
    expect(deps.log).toHaveBeenCalledWith('provider_failed', 'UNKNOWN')
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain('私密正文')
  })

  it('keeps an explicit history scan behind the same preference boundary', async () => {
    const deps = dependencies()
    deps.preferences.get.mockResolvedValue({ enabled: false, updatedAt: null })

    await expect(new ReviewService(deps).scanExistingThoughts(ids.user)).resolves.toEqual({
      status: 'disabled',
      created: 0,
    })

    expect(deps.thoughts.listReviewCorpus).not.toHaveBeenCalled()
    expect(deps.connections.listExistingPairs).not.toHaveBeenCalled()
    expect(deps.provider.findConnectionPairs).not.toHaveBeenCalled()
  })

  it('requires at least two existing thoughts before calling the provider', async () => {
    const deps = dependencies()
    deps.thoughts.listReviewCorpus.mockResolvedValue([
      { id: ids.firstTarget, summary: '只有一条' },
    ])

    await expect(new ReviewService(deps).scanExistingThoughts(ids.user)).resolves.toEqual({
      status: 'not-enough-content',
      created: 0,
    })

    expect(deps.connections.listExistingPairs).not.toHaveBeenCalled()
    expect(deps.provider.findConnectionPairs).not.toHaveBeenCalled()
  })

  it('scans bounded history on demand and stores only anchored pending candidates', async () => {
    const deps = dependencies()
    const corpus = [
      { id: ids.firstTarget, summary: '旧摘要一' },
      { id: ids.secondTarget, summary: '旧摘要二' },
    ]
    const existingPairs = [{
      sourceThoughtId: ids.thought,
      targetThoughtId: ids.firstTarget,
    }]
    deps.thoughts.listReviewCorpus.mockResolvedValue(corpus)
    deps.connections.listExistingPairs.mockResolvedValue(existingPairs)

    await expect(new ReviewService(deps).scanExistingThoughts(ids.user)).resolves.toEqual({
      status: 'processed',
      created: 1,
    })

    expect(deps.thoughts.listReviewCorpus).toHaveBeenCalledWith(ids.user)
    expect(deps.connections.listExistingPairs).toHaveBeenCalledWith(
      ids.user,
      [ids.firstTarget, ids.secondTarget],
    )
    expect(deps.provider.findConnectionPairs).toHaveBeenCalledWith(corpus, existingPairs)
    expect(deps.entries.firstUserEntry).toHaveBeenCalledWith(ids.user, ids.firstTarget)
    expect(deps.entries.firstUserEntry).toHaveBeenCalledWith(ids.user, ids.secondTarget)
    expect(deps.connections.createCandidate).toHaveBeenCalledWith({
      userId: ids.user,
      currentThoughtId: ids.firstTarget,
      targetThoughtId: ids.secondTarget,
      currentEntryId: ids.firstTargetEntry,
      targetEntryId: ids.secondTargetEntry,
      rationale: '两条旧想法都在处理同一个取舍',
    })
    expect(deps.entries.claimForReview).not.toHaveBeenCalled()
  })

  it('keeps an explicit provider failure retryable without logging history text', async () => {
    const deps = dependencies()
    deps.provider.findConnectionPairs.mockRejectedValue(new Error('供应商返回了：旧的私密内容'))

    await expect(new ReviewService(deps).scanExistingThoughts(ids.user)).resolves.toEqual({
      status: 'provider-failed',
      created: 0,
    })

    expect(deps.connections.createCandidate).not.toHaveBeenCalled()
    expect(deps.entries.claimForReview).not.toHaveBeenCalled()
    expect(deps.log).toHaveBeenCalledWith('provider_failed', 'UNKNOWN')
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain('私密内容')
  })

  it('reports an explicit candidate persistence failure instead of saying no connection was found', async () => {
    const deps = dependencies()
    deps.connections.createCandidate.mockRejectedValue(new Error('write failed'))

    await expect(new ReviewService(deps).scanExistingThoughts(ids.user)).resolves.toEqual({
      status: 'persistence-failed',
      created: 0,
    })

    expect(deps.log).toHaveBeenCalledWith('candidate_save_failed', 'UNKNOWN')
  })
})
