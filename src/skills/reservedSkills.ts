import { conflictsWithAmirahCoCoreSkill } from './bundled/amirahcoCore.js'
import { conflictsWithAmirahCoQualitySkill } from './bundled/amirahcoQuality.js'

export function conflictsWithAmirahCoProductSkill(name: string): boolean {
  return conflictsWithAmirahCoCoreSkill(name) || conflictsWithAmirahCoQualitySkill(name)
}
