import { isAbsolute, normalize } from 'node:path'

// Explicit local configuration only; no host scan or download in the application.
export function sharedSkillRoots(raw = process.env.AMIRAHCO_SKILL_ROOTS): string[] {
  if (!raw) return []
  const roots: unknown = JSON.parse(raw)
  if (!Array.isArray(roots) || roots.length > 128 || roots.some(root => typeof root !== 'string' || !isAbsolute(root))) {
    throw new Error('AMIRAHCO_SKILL_ROOTS must be a JSON array of at most 128 absolute skill-directory paths')
  }
  return [...new Set((roots as string[]).map(root => normalize(root)))]
}
