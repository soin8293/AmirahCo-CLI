import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {windowsStartupEnvironment} from './windows-startup.mjs'
const tty={stdinTTY:true,stdoutTTY:true,nodeVersion:'24.22.1'}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')

test('Windows defaults preserve explicit config, provider, controls and environment identity',()=>{
 const env={LOCALAPPDATA:'C:/Users/test/AppData/Local',OPENAI_BASE_URL:'https://configured.invalid/v1',AMIRAHCO_PYTHON:'C:/Python/python.exe',CLAUDE_CODE_DISABLE_MOUSE:'1'}
 const result=windowsStartupEnvironment([],env,tty)
 assert.match(result.OPENCLAUDE_CONFIG_DIR,/AmirahCo CLI/);assert.equal(result.AMIRAHCO_STARTUP_QUESTIONS,'1')
 for(const key of Object.keys(env))assert.equal(result[key],env[key])
 assert.equal(env.OPENCLAUDE_CONFIG_DIR,undefined)
 const explicit=windowsStartupEnvironment(['--resume','same-id'],{...env,OPENCLAUDE_CONFIG_DIR:'C:/existing/state',AMIRAHCO_STARTUP_QUESTIONS:'1'},tty)
 assert.equal(explicit.OPENCLAUDE_CONFIG_DIR,'C:/existing/state');assert.equal(explicit.AMIRAHCO_STARTUP_QUESTIONS,undefined)
})
test('Windows preflight refuses obsolete Node and unpaintable piped startup without resetting state',()=>{
 assert.throws(()=>windowsStartupEnvironment([],{}, {...tty,nodeVersion:'20.1.0'}),/22 or newer/)
 assert.throws(()=>windowsStartupEnvironment([],{}, {...tty,stdinTTY:false}),/interactive terminal/)
 assert.doesNotThrow(()=>windowsStartupEnvironment(['--help'],{LOCALAPPDATA:'C:/test'},{...tty,stdinTTY:false,stdoutTTY:false}))
})
test('explicit owner skill roots are mapped without WSL execution or silent omissions',()=>{
 const base=mkdtempSync(join(tmpdir(),'amirahco-win-skills-')),file=join(base,'owner.json')
 writeFileSync(file,JSON.stringify({roots:['/mnt/c/Users/test/skills','D:/native/skills']}))
 const env={LOCALAPPDATA:'C:/test',AMIRAHCO_OWNER_SKILLS_FILE:file}
 assert.deepEqual(JSON.parse(windowsStartupEnvironment([],env,tty).AMIRAHCO_SKILL_ROOTS),['C:/Users/test/skills','D:/native/skills'])
 assert.equal(windowsStartupEnvironment([],{...env,AMIRAHCO_SKILL_ROOTS:'["C:/explicit"]'},tty).AMIRAHCO_SKILL_ROOTS,'["C:/explicit"]')
 writeFileSync(file,JSON.stringify({roots:['/home/linux-only']}))
 assert.throws(()=>windowsStartupEnvironment([],env,tty),/not silently discarded/)
})
function launch(launcher,args,cwd,extra={}){
 const command='"'+[launcher,...args].map(value=>'"'+value+'"').join(' ')+'"'
 return spawnSync(process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',['/d','/s','/c',command],{cwd,encoding:'utf8',timeout:60000,windowsHide:true,windowsVerbatimArguments:true,env:{...process.env,PATH:dirname(process.execPath),OPENCLAUDE_NODE_MAX_OLD_SPACE_SIZE_MB:'512',AMIRAHCO_OWNER_SKILLS_FILE:'',...extra}})
}
test('actual CMD and heap relaunch preserve cwd, arguments, explicit config and status without WSL', {skip:process.platform!=='win32'},()=>{
 const base=mkdtempSync(join(tmpdir(),'amirahco-native-launch-')),pkg=join(base,'package with spaces'),bin=join(pkg,'bin'),cwd=join(base,"owner's workspace")
 mkdirSync(bin,{recursive:true});mkdirSync(join(pkg,'dist'));mkdirSync(cwd)
 writeFileSync(join(pkg,'package.json'),'{"type":"module"}')
 for(const name of ['amirahcocli','amirahcocli.cmd','windows-startup.mjs','startup-loading.mjs','startup-loading-worker.mjs','startup-connection.mjs','node-compile-cache.mjs'])copyFileSync(join(root,'bin',name),join(bin,name))
 writeFileSync(join(pkg,'dist/cli.mjs'),`console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),config:process.env.OPENCLAUDE_CONFIG_DIR,home:process.env.AMIRAHCO_STARTUP_QUESTIONS,relaunched:process.env.OPENCLAUDE_HEAP_RELAUNCHED}));process.exitCode=23;`)
 const args=['--name',"space & owner's !files",'--resume','original-session','--','prompt | dollar$'],config=join(base,'existing config')
 const result=launch(join(bin,'amirahcocli.cmd'),args,cwd,{OPENCLAUDE_CONFIG_DIR:config,OPENCLAUDE_HEAP_RELAUNCHED:'',OPENCLAUDE_DISABLE_HEAP_RELAUNCH:''})
 assert.equal(result.status,23,result.stderr||String(result.error))
 const value=JSON.parse(result.stdout);assert.deepEqual(value.args,args);assert.equal(value.cwd,cwd);assert.equal(value.config,config);assert.equal(value.home,undefined);assert.equal(value.relaunched,'1')
 assert.doesNotMatch(readFileSync(join(bin,'amirahcocli.cmd'),'utf8'),/wsl|bash/i)
})
test('real compiled Windows launcher serves version/help without WSL, provider or interactive input', {skip:process.platform!=='win32'},()=>{
 const base=mkdtempSync(join(tmpdir(),'amirahco-native-help-')),launcher=join(root,'bin/amirahcocli.cmd'),env={OPENCLAUDE_CONFIG_DIR:join(base,'config'),LOCALAPPDATA:base,AMIRAHCO_SKILL_ROOTS:'[]',AMIRAHCO_ROUTER_BRIDGE:'C:/missing/controller.py',OPENAI_BASE_URL:'http://127.0.0.1:1/v1'}
 for(const flag of ['--version','--help']){
  const result=launch(launcher,[flag],base,env)
  assert.equal(result.status,0,result.stderr||String(result.error));assert.match(result.stdout,flag==='--version'?/1\.0\.0 \(AmirahCo CLI\)/:/Usage:/)
  assert.doesNotMatch(result.stderr,/Loading|AI is temporarily|wsl|not recognized/i)
 }
 const missing=launch(launcher,['--version'],base,{...env,PATH:''})
 assert.notEqual(missing.status,0);assert.match(missing.stderr,/needs native Windows Node.js 22/)
 const piped=launch(launcher,[],base,env)
 assert.equal(piped.status,1);assert.match(piped.stderr,/interactive terminal/)
})
