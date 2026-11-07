import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ToolUseContext } from '../../Tool.js'

const searchNativeSkills = mock(async () => [
  {
    id: 'amirahco-prd',
    name: 'amirahco-prd',
    description: 'catalogue text',
    descriptionForDisplay: 'Create or update a PRD.',
    score: 1,
  },
])

mock.module('./localSearch.js', () => ({ searchNativeSkills }))

const { getTurnZeroSkillDiscovery } = await import('./prefetch.js')

const context = {
  discoveredSkillNames: new Set<string>(),
} as ToolUseContext

beforeEach(() => {
  searchNativeSkills.mockClear()
  context.discoveredSkillNames?.clear()
  delete process.env.AMIRAHCO_SKILL_MATCHING
})

afterEach(() => delete process.env.AMIRAHCO_SKILL_MATCHING)

describe('turn-zero skill discovery', () => {
  test('emits a native reminder before the model turn', async () => {
    const attachments = await getTurnZeroSkillDiscovery(
      'draft a PRD',
      [],
      context,
    )

    expect(attachments).toEqual([
      {
        type: 'skill_discovery',
        skills: [
          {
            name: 'amirahco-prd',
            description: 'Create or update a PRD.',
          },
        ],
        signal: 'user_input',
        source: 'native',
      },
    ])
    expect(searchNativeSkills).toHaveBeenCalledWith('draft a PRD', context, {
      topK: 6,
    })
    expect(context.discoveredSkillNames?.has('amirahco-prd')).toBe(true)
  })

  test('re-evaluates a later human request instead of using telemetry as a gate', async () => {
    await getTurnZeroSkillDiscovery('draft a PRD', [], context)
    const second = await getTurnZeroSkillDiscovery('revise the PRD', [], context)

    expect(searchNativeSkills).toHaveBeenCalledTimes(2)
    expect(second).toHaveLength(1)
  })

  test('supports the narrow runtime opt-out', async () => {
    process.env.AMIRAHCO_SKILL_MATCHING = '0'

    expect(
      await getTurnZeroSkillDiscovery('draft a PRD', [], context),
    ).toEqual([])
    expect(searchNativeSkills).not.toHaveBeenCalled()
  })
})
