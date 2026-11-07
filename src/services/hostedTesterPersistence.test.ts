import { expect, test } from 'bun:test'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

test('real native store saves and reopens tester access in a fresh process without losing another provider',()=>{
  const parent=realpathSync(tmpdir()), root=mkdtempSync(join(parent,'amirahco-tester-profile-'))
  try {
    const entry=fileURLToPath(new URL('../../tests/native-tester-profile.fixture.ts',import.meta.url))
    for(const mode of ['save','reopen']) {
      const result=spawnSync(process.execPath,[entry,mode],{cwd:root,encoding:'utf8',timeout:20000,
        env:{...process.env,NODE_ENV:'development',OPENCLAUDE_CONFIG_DIR:root,CLAUDE_CONFIG_DIR:root,
          AMIRAHCO_TESTER_BASE_URL:'https://testers.example/v1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'}})
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toContain('"activeTester":true')
      expect(result.stdout).toContain('"profiles":2')
    }
  } finally {
    const checked=realpathSync(root)
    if(dirname(checked)!==resolve(parent)||!checked.split(/[\\/]/).pop()?.startsWith('amirahco-tester-profile-')) throw new Error('Fixture cleanup target mismatch')
    rmSync(checked,{recursive:true,force:true})
  }
},45000)
