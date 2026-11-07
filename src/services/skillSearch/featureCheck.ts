/**
 * Automatic native skill matching is enabled for AmirahCo CLI. The opt-out is
 * deliberately narrow so a damaged catalogue can be isolated without
 * disabling the native SkillTool or deleting installed skills.
 */
export function isSkillSearchEnabled(): boolean {
  const value = process.env.AMIRAHCO_SKILL_MATCHING?.trim().toLowerCase()
  return value !== '0' && value !== 'false' && value !== 'off'
}
