import { createHash } from 'node:crypto'
import { getBundledSkills, registerBundledSkill } from '../bundledSkills.js'
import resources from './amirahcoQualityResources.json'
import manifest from './amirahcoQualityManifest.json'

export const AMIRAHCO_QUALITY_VERSION = '1.0.0'
export const AMIRAHCO_QUALITY_PACK = `amirahco-quality@${AMIRAHCO_QUALITY_VERSION}`
export const AMIRAHCO_QUALITY_SKILL_NAMES = [
  'amirahco-code-quality',
  'amirahco-typescript-quality',
  'amirahco-maintainability-review',
] as const
export type AmirahCoQualitySkillName = (typeof AMIRAHCO_QUALITY_SKILL_NAMES)[number]

const names = new Set<string>(AMIRAHCO_QUALITY_SKILL_NAMES)
export function conflictsWithAmirahCoQualitySkill(name: string): boolean {
  return names.has(name.slice(name.lastIndexOf(':') + 1))
}

const controls = `## Scope, controls and evidence
Use the current project/session, approved task, role, exact PRD revision, context/profile, Stop state, permissions, claims and remaining limits. These instructions grant no tools or permission and do not change the selected agent total.
Remain in this native session. Do not create extra reviewers or workers outside the selected roster, a workflow engine or an independent-review claim. Honor newer restrictions; pending expansion is not approved work. Preserve dirty user work, unfinished changes, public behavior, UI/accessibility, legal notices, useful rationale, validation and recovery guards.
Review requests are read-only. Apply only currently authorized fixes. Missing/stale required context or quality content holds the affected action; restart, compaction and channel changes require current context adoption, not a new run or allowance.
Automatic quality repair is not enabled. Report a concrete failure and hold for an explicit scoped decision; do not start a repair loop, reserve repair slots or modify coordination controls. Reconcile any original uncertain effect before new protected work. Never clear Stop or replay an uncertain edit.
Record actual checks against exact artifact/criterion/context/pack inputs through the owning APIs and prepared submission. Never author SQL, protocol identities, hashes or acceptance. This author's review is self_check; owner and independent dispositions require their actual actors. Changed inputs invalidate affected evidence. Owner-review waits stay idle.`

export const AMIRAHCO_QUALITY_PROMPTS: Record<AmirahCoQualitySkillName, string> = {
  'amirahco-code-quality': `# Code quality
Adapted from Ponytail and selected P-Stack guidance.
${controls}

Before editing, inspect the scoped change, connected callers, tests, fixtures, config and exports. Identify accepted behavior and user-owned changes. Reuse an existing native feature, helper or installed dependency before adding code; choose the smallest complete change in the established layer. No speculative abstractions, broad rewrites or feature deletion to reduce line counts.
Validate external inputs at trusted system boundaries using existing schemas; trust validated internal types. Preserve error handling that prevents data loss. Keep meaningful rationale, safety, public contracts, legal notices and suppressions until their actual constraint is understood; do not mechanically purge comments.
Perform meaningful behavioral checks on the final artifact, including affected preserved behavior and relevant failure/edge cases. Compilation alone is insufficient. Do not weaken assertions to pass, invent checks or confuse a pre-existing failure with a regression. Explain unchecked behavior and actual limitations.
For TS/TSX, invoke amirahco-typescript-quality through native SkillTool before editing or reviewing. Before final coding review, invoke amirahco-maintainability-review in this same session. Consolidate overlapping findings once, not three compulsory model calls or repeated rewrites. Non-code work skips inapplicable code rubrics with a reason.
Report the requested outcome, scoped changes, actual checks and concrete findings. Advice without a demonstrated consequence is advisory; no claimed savings or automatic completion.`,
  'amirahco-typescript-quality': `# TypeScript quality
Adapted from P-Stack TypeScript, type-system and boundary guidance.
${controls}

Use the shared amirahco-code-quality guidance through native SkillTool if it is not already current. Read connected types and consumers before changing their contract.
Model real variants with discriminated unions and exhaustive narrowing. Derive types from existing schemas and signatures instead of duplicate interfaces. Use unknown for external data and parse once at the boundary with the repository's schema library; keep domain logic on validated types.
Prefer narrowing and satisfies over assertions. A guard must verify what it claims. Brand identifiers only when demonstrated confusion warrants it, using validation rather than an unchecked cast. Keep ordinary arrays when operations are total; use stronger non-empty types only where they remove real unsafe assumptions. No mechanical bans, type proliferation or wrappers for style alone.
Keep errors, cancellation, persistence and permission boundaries intact. Check changed API consumers and actual runtime behavior, not only typechecking. Use the existing logger with appropriate redaction; no private input or keys in evidence.
Examples: parse an external object with the established schema and infer its type; switch on a validated kind and handle every variant; retain a simple array for map/filter rather than introducing a new collection abstraction. Optional patterns are supplementary; these required rules are fully present in this prompt.`,
  'amirahco-maintainability-review': `# Maintainability review
Adapted from the thermonuclear code quality rubric and Ponytail review questions.
${controls}

Review the final scoped diff and connected consumers for canonical ownership, unnecessary layers, duplicated state/filtering, coupling, branching, leaky abstractions, correctness, data loss and expensive repeated work. Reuse established native infrastructure. A simple direct design is preferable when it solves the whole approved task.
Look for structural simplifications with a concrete benefit, but do not broaden scope, rewrite working subsystems or remove accepted features. A file crossing 1000 lines is a signal to inspect responsibilities, not an automatic failure or instruction to split. Line counts, style preferences and speculative performance are advisory without evidence.
Consolidate duplicate findings. Each finding states its location, consequence, relevant requirement/criterion, severity, proposed scoped remedy and evidence. Distinguish open, fixed, rejected_with_reason, superseded and not_applicable; do not relabel stale evidence as pass. A blocking finding needs an actual consequence or violated current criterion.
Bind the self-check to exact final artifacts and performed checks, and include preservation results and limitations. Keep required owner/independent review separate. Failed checks lead to a hold or explicitly authorized scoped fix, never an automatic repair loop.`,
}

export const AMIRAHCO_QUALITY_DESCRIPTIONS: Record<AmirahCoQualitySkillName, string> = {
  'amirahco-code-quality': 'Use before coding: reuse existing code, make minimal complete changes and check preserved behavior.',
  'amirahco-typescript-quality': 'Use before TS/TSX implementation or review: TypeScript types, schemas, narrowing and trusted boundaries.',
  'amirahco-maintainability-review': 'Use for final coding self-review: ownership, coupling, duplication, branches and concrete maintainability findings.',
}

export function qualityBodyDigest(name: AmirahCoQualitySkillName): string {
  return createHash('sha256').update(AMIRAHCO_QUALITY_PROMPTS[name], 'utf8').digest('hex')
}

export function registerAmirahCoQualitySkills(): void {
  const registered = new Set(getBundledSkills().map(skill => skill.name))
  for (const name of AMIRAHCO_QUALITY_SKILL_NAMES) {
    if (registered.has(name)) continue
    registerBundledSkill({
      name,
      version: AMIRAHCO_QUALITY_VERSION,
      description: AMIRAHCO_QUALITY_DESCRIPTIONS[name],
      whenToUse: AMIRAHCO_QUALITY_DESCRIPTIONS[name],
      context: 'inline',
      allowedTools: [],
      files: resources,
      async getPromptForCommand(args) {
        const body = AMIRAHCO_QUALITY_PROMPTS[name]
        if (!body.trim()) throw new Error(`Required quality body missing: ${name}`)
        const resourceDigest = createHash('sha256').update(JSON.stringify(resources)).digest('hex')
        if (qualityBodyDigest(name) !== manifest.bodyHashes[name] || resourceDigest !== manifest.resourceSetSha256) {
          throw new Error(`Required quality content is stale: ${name}; hold the affected action.`)
        }
        return [{ type: 'text', text: `${body}\n\nPack: ${AMIRAHCO_QUALITY_PACK}\nBody SHA-256: ${qualityBodyDigest(name)}\nResource-set SHA-256: ${resourceDigest}${args ? `\n\n## Current request\n\n${args}` : ''}` }]
      },
    })
  }
}
