import { afterEach, describe, expect, test } from 'bun:test'
import { clearBundledSkills, getBundledSkills } from '../../skills/bundledSkills.js'
import { registerAmirahCoCoreSkills } from '../../skills/bundled/amirahcoCore.js'
import { registerAmirahCoQualitySkills } from '../../skills/bundled/amirahcoQuality.js'
import {
  commandToSkillCandidate,
  rankSkillCandidates,
} from './matcher.js'
import { isSkillSearchEnabled } from './featureCheck.js'

// Native extraction paths use the build-time version macro.
Object.defineProperty(globalThis, 'MACRO', { value: { VERSION: '1.0.0' }, configurable: true })

afterEach(() => {
  clearBundledSkills()
  delete process.env.AMIRAHCO_SKILL_MATCHING
})

describe('native skill catalogue matching', () => {
  test.each([
    ['start a new project from my idea', 'amirahco-discovery'],
    ['draft the product requirements document and PRD', 'amirahco-prd'],
    ['these requirements are vague and contradictory', 'amirahco-clarify'],
    ['resume unfinished work after an app restart', 'amirahco-context'],
    ['build the approved project with the saved workflow', 'amirahco-work'],
    ['verify the artifact against its acceptance criteria', 'amirahco-review'],
  ])('ranks %s as %s', async (query, expectedName) => {
    registerAmirahCoCoreSkills()
    const candidates = getBundledSkills().map(commandToSkillCandidate)
    const matches = await rankSkillCandidates(query, candidates, { topK: 1 })

    expect(matches[0]?.id).toBe(expectedName)
  })

  test('returns no suggestion when no catalogue term overlaps', async () => {
    registerAmirahCoCoreSkills()
    const candidates = getBundledSkills().map(commandToSkillCandidate)

    expect(
      await rankSkillCandidates('sing neon zebras quietly', candidates),
    ).toEqual([])
  })

  test('supports a narrow runtime rollback without removing native skills', () => {
    expect(isSkillSearchEnabled()).toBe(true)
    process.env.AMIRAHCO_SKILL_MATCHING = '0'
    expect(isSkillSearchEnabled()).toBe(false)
    expect(getBundledSkills()).toEqual([])
  })
})


describe('quality skill selection through the native matcher', () => {
  test.each([
    ['reuse existing coding utilities for a minimal change', 'amirahco-code-quality'],
    ['typescript tsx narrowing schema types boundary', 'amirahco-typescript-quality'],
    ['maintainability structural coupling duplication final self-review', 'amirahco-maintainability-review'],
  ])('selects %s as %s without invoking it', async (query, expectedName) => {
    registerAmirahCoCoreSkills()
    registerAmirahCoQualitySkills()
    const matches = await rankSkillCandidates(query, getBundledSkills().map(commandToSkillCandidate), { topK: 1 })
    expect(matches[0]?.id).toBe(expectedName)
  })
})
