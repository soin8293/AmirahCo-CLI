import type { ToolUseContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import type { Attachment } from '../../utils/attachments.js'
import { isSkillSearchEnabled } from './featureCheck.js'
import { searchNativeSkills } from './localSearch.js'
import type { DiscoverySignal } from './signals.js'

/** Opaque handle for an in-flight skill-discovery prefetch. */
export type SkillDiscoveryPrefetch = {
  promise: Promise<Attachment[]>
}

async function discover(
  input: string | null,
  context: ToolUseContext,
  signal: DiscoverySignal,
): Promise<Attachment[]> {
  if (!isSkillSearchEnabled()) return []
  const query = input?.trim()
  if (!query) return []

  const matches = await searchNativeSkills(query, context, {
    topK: 6,
  })
  if (matches.length === 0) return []

  for (const match of matches) {
    context.discoveredSkillNames?.add(match.name)
  }

  return [
    {
      type: 'skill_discovery',
      skills: matches.map(match => ({
        name: match.name,
        description: match.descriptionForDisplay,
      })),
      signal,
      source: 'native',
    },
  ]
}

/**
 * User-input matching happens before the first model turn. The inter-turn hook
 * remains conservative: without new human intent it does not invent a pivot
 * from generated text or tool output.
 */
export function startSkillDiscoveryPrefetch(
  input: string | null,
  _messages: Message[],
  context: ToolUseContext,
): SkillDiscoveryPrefetch | null {
  if (!input?.trim()) return null
  return { promise: discover(input, context, 'assistant_turn') }
}

/** Collect a prefetch already started by the native query loop. */
export async function collectSkillDiscoveryPrefetch(
  pending: SkillDiscoveryPrefetch,
): Promise<Attachment[]> {
  return pending.promise
}

/** Match the current user request before the first model turn. */
export async function getTurnZeroSkillDiscovery(
  input: string | null,
  _messages: Message[],
  context: ToolUseContext,
): Promise<Attachment[]> {
  return discover(input, context, 'user_input')
}
