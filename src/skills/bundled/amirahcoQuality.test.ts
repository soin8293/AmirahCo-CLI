import { afterEach, expect, test } from 'bun:test'
import type { ToolUseContext } from '../../Tool.js'
import { clearBundledSkills, getBundledSkills } from '../bundledSkills.js'
import { conflictsWithAmirahCoProductSkill } from '../reservedSkills.js'
import { isPublicSkill } from '../../cli/handlers/skillsListFormat.js'
import { registerAmirahCoCoreSkills } from './amirahcoCore.js'
import {
  AMIRAHCO_QUALITY_PROMPTS,
  AMIRAHCO_QUALITY_SKILL_NAMES,
  qualityBodyDigest,
  registerAmirahCoQualitySkills,
} from './amirahcoQuality.js'
import { SIMPLIFY_PROMPT, registerSimplifySkill } from './simplify.js'
import resources from './amirahcoQualityResources.json'

// Native extraction paths use the build-time version macro.
Object.defineProperty(globalThis, 'MACRO', { value: { VERSION: '1.0.0' }, configurable: true })

afterEach(() => clearBundledSkills())

test('registers exactly three additional public inline skills, idempotently and without grants', () => {
  registerAmirahCoCoreSkills()
  registerAmirahCoQualitySkills()
  registerAmirahCoQualitySkills()
  const skills = getBundledSkills()
  expect(skills).toHaveLength(9)
  for (const name of AMIRAHCO_QUALITY_SKILL_NAMES) {
    const skill = skills.find(command => command.name === name)
    if (!skill || skill.type !== 'prompt') throw new Error(`Missing ${name}`)
    expect(isPublicSkill(skill)).toBe(true)
    expect(skill.context).toBe('inline')
    expect(skill.version).toBe('1.0.0')
    expect(skill.allowedTools).toEqual([])
    expect(skill.hooks).toBeUndefined()
    expect(skill.agent).toBeUndefined()
    expect(skill.model).toBeUndefined()
    expect(skill.disableModelInvocation).toBe(false)
    expect(conflictsWithAmirahCoProductSkill(name)).toBe(true)
    expect(conflictsWithAmirahCoProductSkill(`foreign:${name}`)).toBe(true)
  }
  expect(conflictsWithAmirahCoProductSkill('custom-quality')).toBe(false)
})

test('actual native prompt callback returns complete required body, digests and exact scope', async () => {
  registerAmirahCoQualitySkills()
  for (const skill of getBundledSkills()) {
    if (skill.type !== 'prompt') throw new Error('Expected native prompt')
    const name = AMIRAHCO_QUALITY_SKILL_NAMES.find(name => name === skill.name)
    if (!name) throw new Error('Unexpected skill')
    const blocks = await skill.getPromptForCommand('review only src/export.ts', {} as ToolUseContext)
    const text = blocks.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
    expect(text).toContain(AMIRAHCO_QUALITY_PROMPTS[name])
    expect(text).toContain(qualityBodyDigest(name))
    expect(text).toContain('Resource-set SHA-256:')
    expect(text).toContain('review only src/export.ts')
    expect(text).toContain('Automatic quality repair is not enabled')
    expect(text).toContain('self_check')
    expect(text).toContain('Stop')
  }
})

test('resources are the frozen non-entrypoint allowlist and retain all three licenses', () => {
  expect(Object.keys(resources).sort()).toEqual([
    'notices/cursor-team-kit-MIT.txt', 'notices/ponytail-MIT.txt',
    'notices/pstack-MIT.txt', 'references/source-map.json',
    'references/typescript-patterns.md',
  ])
  for (const [name, body] of Object.entries(resources)) {
    expect(name).not.toContain('SKILL.md')
    expect(name).not.toContain('..')
    if (name.startsWith('notices/')) expect(body).toContain('Permission is hereby granted')
  }
})

test('simplify keeps native scope, read-only review and single-session guidance', async () => {
  registerSimplifySkill()
  const skill = getBundledSkills()[0]
  if (!skill || skill.type !== 'prompt') throw new Error('Missing simplify')
  const blocks = await skill.getPromptForCommand('review only src/export.ts', {} as ToolUseContext)
  expect(blocks).toEqual([{type: 'text', text: `${SIMPLIFY_PROMPT}\n\n## Current request\n\nreview only src/export.ts`}])
  expect(SIMPLIFY_PROMPT).not.toContain('Launch Three')
  expect(SIMPLIFY_PROMPT).toContain('review-only request is read-only')
  expect(SIMPLIFY_PROMPT).toContain('never fall back to recently modified files')
  expect(SIMPLIFY_PROMPT).toContain('Automatic quality repairs are disabled')
  expect(skill.allowedTools).toEqual([])
})


test('missing or changed required body fails closed instead of returning a stale prompt', async () => {
  registerAmirahCoQualitySkills()
  const name = 'amirahco-code-quality'
  const original = AMIRAHCO_QUALITY_PROMPTS[name]
  const skill = getBundledSkills().find(skill => skill.name === name)
  if (!skill || skill.type !== 'prompt') throw new Error('Missing code quality')
  try {
    AMIRAHCO_QUALITY_PROMPTS[name] = ''
    await expect(skill.getPromptForCommand('', {} as ToolUseContext)).rejects.toThrow('Required quality body missing')
    AMIRAHCO_QUALITY_PROMPTS[name] = original + ' changed'
    await expect(skill.getPromptForCommand('', {} as ToolUseContext)).rejects.toThrow('Required quality content is stale')
  } finally {
    AMIRAHCO_QUALITY_PROMPTS[name] = original
  }
})


test('native slash processing places the complete quality body in model-bound messages without grants', async () => {
  const { processPromptSlashCommand } = await import('../../utils/processUserInput/processSlashCommand.js')
  const { getDefaultAppState } = await import('../../state/AppStateStore.js')
  registerAmirahCoQualitySkills()
  let state = getDefaultAppState()
  const context = {
    options: { commands: getBundledSkills(), tools: [], isNonInteractiveSession: true },
    getAppState: () => state,
    setAppState: (update: (current: typeof state) => typeof state) => { state = update(state) },
    messages: [],
    abortController: new AbortController(),
    readFileState: new Map(),
  } as unknown as ToolUseContext
  for (const name of AMIRAHCO_QUALITY_SKILL_NAMES) {
    const result = await processPromptSlashCommand(name, '', getBundledSkills(), context)
    expect(result.shouldQuery).toBe(true)
    const messages = JSON.stringify(result.messages)
    expect(messages).toContain(qualityBodyDigest(name))
    expect(messages).toContain('Automatic quality repair is not enabled')
    expect(result.allowedTools ?? []).toEqual([])
    expect(result.model).toBeUndefined()
  }
})
