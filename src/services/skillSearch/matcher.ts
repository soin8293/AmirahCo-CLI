import {
  lexicalMatcher,
  type SkillCandidate,
  type SkillMatch,
} from '@deuz-sdk/core/skills'
import type { Command } from '../../types/command.js'

const DEFAULT_TOP_K = 6

const AMIRAHCO_CORE_MATCH_HINTS: Record<string, string> = {
  'amirahco-code-quality':
    'coding reuse minimal change simplify cleanup implementation behavior preserve',
  'amirahco-typescript-quality':
    'typescript ts tsx narrowing discriminated union schema types boundary',
  'amirahco-maintainability-review':
    'maintainability structural review coupling duplication abstraction final self-review',
  'amirahco-context':
    'resume reopen recover recovery restart interruption handoff compact memory current state requirement change',
  'amirahco-discovery':
    'new project start setup intake idea explore interview personalized questions goals constraints success',
  'amirahco-prd':
    'prd product requirements document specification spec draft revise update validate approve planning',
  'amirahco-clarify':
    'clarify clarification ambiguous ambiguity unclear vague missing contradictory incomplete question prebuild',
  'amirahco-work':
    'build implement execute workflow run task approved activation repair continue work',
  'amirahco-review':
    'review verify validation test audit acceptance evidence complete completion done quality check',
}

export type SkillCatalogCommand = Pick<
  Command,
  'name' | 'description' | 'whenToUse' | 'aliases' | 'kind'
>

export function commandToSkillCandidate(
  command: SkillCatalogCommand,
): SkillCandidate {
  const aliases = command.aliases?.join(' ') ?? ''
  const workflowHints =
    command.kind === 'workflow'
      ? 'workflow automation process steps execute resume wait repair'
      : ''
  const coreHints = AMIRAHCO_CORE_MATCH_HINTS[command.name] ?? ''
  return {
    id: command.name,
    name: command.name,
    description: [
      command.description,
      command.whenToUse,
      aliases,
      workflowHints,
      coreHints,
    ]
      .filter(Boolean)
      .join(' '),
  }
}

export async function rankSkillCandidates(
  query: string,
  candidates: SkillCandidate[],
  options: { topK?: number; threshold?: number } = {},
): Promise<Array<SkillCandidate & { score: number }>> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery || candidates.length === 0) return []

  const matches = await lexicalMatcher.match(normalizedQuery, candidates, {
    topK: options.topK ?? DEFAULT_TOP_K,
    threshold: options.threshold ?? 0,
  })
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]))
  return matches.flatMap((match: SkillMatch) => {
    const candidate = byId.get(match.id)
    return candidate ? [{ ...candidate, score: match.score }] : []
  })
}
