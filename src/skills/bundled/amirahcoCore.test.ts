import { createHash } from 'node:crypto'
import { afterEach, describe, expect, test } from 'bun:test'
import type { ToolUseContext } from '../../Tool.js'
import type { Command, PromptCommand } from '../../types/command.js'
import { clearBundledSkills, getBundledSkills } from '../bundledSkills.js'
import {
  AMIRAHCO_CORE_PROMPTS,
  AMIRAHCO_CORE_SKILL_NAMES,
  AMIRAHCO_CORE_VERSION,
  conflictsWithAmirahCoCoreSkill,
  getBundledWorkflowPaths,
  registerAmirahCoCoreSkills,
} from './amirahcoCore.js'

afterEach(() => clearBundledSkills())

describe('AmirahCo core skill pack', () => {
  test('registers the six portable inline skills with no permission grants', () => {
    registerAmirahCoCoreSkills()
    const skills = getBundledSkills().filter(
      (command): command is Command & PromptCommand =>
        command.type === 'prompt' && conflictsWithAmirahCoCoreSkill(command.name),
    )

    expect(skills.map(skill => skill.name)).toEqual([...AMIRAHCO_CORE_SKILL_NAMES])
    for (const skill of skills) {
      expect(skill.source).toBe('bundled')
      expect(skill.loadedFrom).toBe('bundled')
      expect(skill.version).toBe(AMIRAHCO_CORE_VERSION)
      expect(skill.context).toBe('inline')
      expect(skill.allowedTools).toEqual([])
      expect(skill.hooks).toBeUndefined()
      expect(skill.model).toBeUndefined()
      expect(skill.agent).toBeUndefined()
      expect(skill.userInvocable).toBe(true)
      expect(skill.disableModelInvocation).toBe(false)
      expect(skill.whenToUse?.length).toBeGreaterThan(20)
    }
    expect(skills.find(skill => skill.name === 'amirahco-work')?.kind).toBe(
      'workflow',
    )
  })

  test('protects exact, namespaced and alias references to reserved names', () => {
    expect(conflictsWithAmirahCoCoreSkill('amirahco-prd')).toBe(true)
    expect(conflictsWithAmirahCoCoreSkill('foreign:amirahco-prd')).toBe(true)
    expect(conflictsWithAmirahCoCoreSkill('prd')).toBe(false)
  })

  test('loads each full prompt and appends only the current request', async () => {
    registerAmirahCoCoreSkills()
    const context = {} as ToolUseContext
    for (const skill of getBundledSkills()) {
      if (!conflictsWithAmirahCoCoreSkill(skill.name) || skill.type !== 'prompt') {
        continue
      }
      const blocks = await skill.getPromptForCommand('specific request', context)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]?.type).toBe('text')
      if (blocks[0]?.type === 'text') {
        expect(blocks[0].text).toContain('specific request')
        expect(blocks[0].text).toContain('## Current request')
      }
    }
  })

  test('ships the workflow runner and lifecycle graph beside the package', () => {
    const paths = getBundledWorkflowPaths()
    expect(paths).not.toBeNull()
    expect(paths?.runner.endsWith('scripts\\foundry.py') || paths?.runner.endsWith('scripts/foundry.py')).toBe(true)
    expect(paths?.graph.endsWith('amirahco-project-lifecycle.json')).toBe(true)
  })

  test('keeps prompt bodies pinned to the current reviewed hashes', () => {
    const expected: Record<string, string> = {
      // Reviewed change: require the supported Foundry reader; never raw SQL.
      'amirahco-context': '4b33a17c452293a070d89f453a258333c63c2f8a41201259c2a135cf227365d8',
      'amirahco-discovery': 'f6dc4c37132565cdb32a7cef549bd85edd3e37ed8b615e00643defc8ddbc2e73',
      'amirahco-prd': 'a98ae342e4d6265ddf84c0900e008279232117540933e14f249cbc8ee44f2108',
      'amirahco-clarify': 'b24009b11aaf5a985554075e6cc0a18803aac37b71d9de87651abb5ba6a58200',
      'amirahco-work': 'a3d6b24e5eb9d3dee395eaf80b4579807bd67e056760355795cc01c3090d3a68',
      'amirahco-review': 'f779f7a369056acce314a7bc5625ae10010bae92d197ba402d50a5f535e6f356',
    }
    const actual = Object.fromEntries(
      Object.entries(AMIRAHCO_CORE_PROMPTS).map(([name, prompt]) => [
        name,
        createHash('sha256').update(prompt, 'utf8').digest('hex'),
      ]),
    )
    expect(actual).toEqual(expected)
  })
})
