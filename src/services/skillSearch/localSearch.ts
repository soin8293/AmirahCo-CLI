import type { SkillCandidate } from '@deuz-sdk/core/skills'
import { getMcpSkillCommands, getSkillToolCommands } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import type { Command } from '../../types/command.js'
import { getProjectRoot } from '../../bootstrap/state.js'
import { commandToSkillCandidate, rankSkillCandidates } from './matcher.js'

export { commandToSkillCandidate, rankSkillCandidates } from './matcher.js'

export type RankedSkillCandidate = SkillCandidate & {
  descriptionForDisplay: string
  score: number
}

let cachedLocalCommands:
  | {
      projectRoot: string
      commands: Command[]
    }
  | undefined

/** Invalidate the adapter catalogue after native skill/plugin changes. */
export function clearSkillIndexCache(): void {
  cachedLocalCommands = undefined
}

async function getNativeCommands(context: ToolUseContext): Promise<Command[]> {
  const projectRoot = getProjectRoot()
  if (!cachedLocalCommands || cachedLocalCommands.projectRoot !== projectRoot) {
    cachedLocalCommands = {
      projectRoot,
      commands: await getSkillToolCommands(projectRoot),
    }
  }

  const commands = new Map<string, Command>()
  for (const command of [
    ...cachedLocalCommands.commands,
    ...getMcpSkillCommands(context.getAppState().mcp.commands),
  ]) {
    if (
      command.disableModelInvocation ||
      command.isEnabled?.() === false ||
      commands.has(command.name)
    ) {
      continue
    }
    commands.set(command.name, command)
  }
  return [...commands.values()]
}

/**
 * Rank the native skill registry without loading skill bodies or bypassing the
 * native SkillTool. Deuz only prunes the catalogue; the model still chooses
 * whether to invoke a result through the existing permission boundary.
 */
export async function searchNativeSkills(
  query: string,
  context: ToolUseContext,
  options: { topK?: number; excludeNames?: ReadonlySet<string> } = {},
): Promise<RankedSkillCandidate[]> {
  const commands = await getNativeCommands(context)
  const commandByName = new Map(commands.map(command => [command.name, command]))
  const candidates = commands
    .filter(command => !options.excludeNames?.has(command.name))
    .map(commandToSkillCandidate)
  const ranked = await rankSkillCandidates(query, candidates, {
    topK: options.topK,
  })

  return ranked.flatMap(candidate => {
    const command = commandByName.get(candidate.id)
    return command
      ? [
          {
            ...candidate,
            descriptionForDisplay: command.description,
          },
        ]
      : []
  })
}
