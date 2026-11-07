import {mkdtemp,cp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,delimiter} from 'node:path'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'

const directory=await mkdtemp(join(tmpdir(),'amirahco-intake-test-build-'))
const modulePath=join(directory,'dist','intake-store.mjs')
const result=await Bun.build({entrypoints:[resolve('tests/native-project-record-command-entry.ts')],target:'node',outdir:join(directory,'dist'),naming:'intake-store.mjs',define:{'process.env.NODE_ENV':JSON.stringify('test')}})
if(!result.success){for(const log of result.logs)console.error(log);process.exit(1)}
const windows=process.platform==='win32'
await cp(resolve('vendor/amirahco-core-foundry'),join(directory,'vendor','amirahco-core-foundry'),{recursive:true})
const args=['--test','tests/native-intake-storage.test.mjs','tests/native-build.test.mjs',...(windows?['tests/native-windows-storage.test.mjs']:[])]
const child=spawnSync('node',args,{stdio:'inherit',env:{...process.env,NODE_ENV:'test',AMIRAHCO_INTAKE_TEST_MODULE:pathToFileURL(modulePath).href,...(windows?{NODE_PATH:[resolve('node_modules'),process.env.NODE_PATH].filter(Boolean).join(delimiter)}:{})}})
process.exit(child.status??1)
