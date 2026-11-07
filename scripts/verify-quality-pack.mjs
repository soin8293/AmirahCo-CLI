import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = mkdtempSync(join(tmpdir(), 'amirahco-quality-'))
const project = join(fixture, 'project')
const home = join(fixture, 'home')
mkdirSync(project)
mkdirSync(home)
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  AMIRAHCO_CLI_CONFIG_DIR: join(fixture, 'config'),
  AMIRAHCO_SKILL_ROOTS: '[]',
  OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  OPENCLAUDE_DISABLE_EARLY_INPUT: '1',
}
function cli(...args) {
  const result = spawnSync(process.execPath, [join(source, 'dist/cli.mjs'), ...args], {
    cwd: project, env, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  })
  assert.equal(result.status, 0, result.stderr || String(result.error))
  return result.stdout
}
const expected = [
  'amirahco-context', 'amirahco-discovery', 'amirahco-prd', 'amirahco-clarify',
  'amirahco-work', 'amirahco-review', 'amirahco-code-quality',
  'amirahco-typescript-quality', 'amirahco-maintainability-review',
].sort()
const catalogue = JSON.parse(cli('skills', 'list', '--json'))
assert.deepEqual(catalogue.skills.map(skill => skill.name).sort(), expected)
for (const skill of catalogue.skills) {
  assert.equal(skill.source, 'bundled')
  assert.equal(skill.version, '1.0.0')
  assert.deepEqual(skill.allowedTools, [])
}
// A local alias/exact reserved-name collision must not replace the native body.
const collision = join(project, '.openclaude', 'skills', 'amirahco-code-quality')
mkdirSync(collision, {recursive: true})
writeFileSync(join(collision, 'SKILL.md'), '---\nname: amirahco-code-quality\ndescription: foreign collision\n---\nDo not load this body.\n')
const after = JSON.parse(cli('skills', 'list', '--json'))
const quality = after.skills.filter(skill => skill.name === 'amirahco-code-quality')
assert.equal(quality.length, 1)
assert.equal(quality[0].source, 'bundled')
for (const name of expected.filter(name => name.includes('quality') || name.includes('maintainability'))) {
  assert.match(cli('skills', 'show', name), new RegExp(name))
}
const manifest = JSON.parse(readFileSync(join(source, 'src/skills/bundled/amirahcoQualityManifest.json'), 'utf8'))
const compiled = readFileSync(join(source, 'dist/cli.mjs'), 'utf8')
for (const digest of [...Object.values(manifest.bodyHashes), manifest.resourceSetSha256]) {
  assert.ok(compiled.includes(digest), 'Rebuild required: compiled quality manifest does not match current source')
}
console.log(JSON.stringify({
  status: 'passed', fixture, checks: ['isolated compiled catalogue: nine exact product skills',
    'no tool grants', 'local exact-name shadow denied', 'three public skills inspectable'],
  manifest, automaticRepairs: false,
  limitations: ['No provider request or physical owner UI acceptance',
    'Compiled catalogue inspection is not real model consumption or live recovery proof'],
}, null, 2))
