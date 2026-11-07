import { registerBundledSkill } from '../bundledSkills.js'

export const SIMPLIFY_PROMPT = `# Simplify: scoped review and cleanup

Stay in this native session and preserve the selected agent total. Do not launch review agents or hidden workers.

1. Establish scope from the user's named files/diff or the current authorized working diff, including staged changes. Inspect connected callers as needed. Keep unrelated dirty user work separate. With no identifiable scoped changes, report that and ask for a scope; never fall back to recently modified files or a whole-repository cleanup.
2. Invoke amirahco-code-quality through native SkillTool if it is not already current. For TS/TSX, also invoke amirahco-typescript-quality. Invoke amirahco-maintainability-review for this scoped review in the same session. Required missing/stale bodies hold the affected action. These skills grant no permissions.
3. Apply reuse, correctness, structure and efficiency guidance in one consolidated review. Check duplication, state ownership, coupling, unnecessary work and actual behavioral consequences. A large file or style preference alone is advisory. Preserve useful comments, legal notices, tests, validation, recovery and accepted features.
4. A review-only request is read-only. A simplify/fix request permits only scoped behavior-preserving edits under current native permissions, Stop, task/PRD revision, context, claims and limits. Do not absorb unrelated edits, widen requirements or bypass controls. Automatic quality repairs are disabled: no retry/repair loop or coordination-budget writes. A failure outside authorized scope is a hold for a decision.
5. Perform meaningful checks of the final artifact and affected preserved behavior. Do not weaken assertions or call compilation alone sufficient. Summarize changes, actual checks, open findings and limitations. This is self-review, never owner or independent acceptance. Keep owner-review waits idle.
`

export function registerSimplifySkill(): void {
  registerBundledSkill({
    name: 'simplify',
    description:
      'Review scoped code for reuse, quality and efficiency; apply only authorized behavior-preserving fixes.',
    userInvocable: true,
    context: 'inline',
    allowedTools: [],
    async getPromptForCommand(args) {
      return [{ type: 'text', text: SIMPLIFY_PROMPT + (args ? `\n\n## Current request\n\n${args}` : '') }]
    },
  })
}
