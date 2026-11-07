import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,stat,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'

const {IntakeStore,resolveWorkflowPython,runtimeCommand,bindFoundryActivation,admitFoundry,getBundledWorkflowPaths}=await import(process.env.AMIRAHCO_INTAKE_TEST_MODULE)
const python=await resolveWorkflowPython()
async function fixture(){
 const base=await mkdtemp(join(tmpdir(),'amirahco-native-build-')),root=join(base,'private state'),workspace=join(base,"workspace & owner's files")
 await mkdir(workspace)
 if(process.platform==='win32'){
  const require=createRequire(import.meta.url),source=await readFile(new URL('../src/services/projectRecords/windowsStorage.cjs',import.meta.url),'utf8')
  const native=new Function('require',`${source};return createWindowsStorage`)(require)(root,require.resolve('koffi'))
  try{native.mkdir(root)}finally{native.close()}
 }else await mkdir(root,{mode:0o700})
 const store=new IntakeStore(root),projectId=randomUUID(),sessionId='native-platform-build-fixture'
 const save={projectId,sessionId,operationId:randomUUID(),type:'save',expectedSequence:0,answers:{idea:'Private command-line calculator',needs:'Local files only',success:'Performed arithmetic checks',helpers:'1'},step:6,phase:'review',create:true}
 await store.save(save)
 const requestId=randomUUID(),request={projectId,sessionId,operationId:randomUUID(),type:'prd_request',expectedSequence:1,expectedPlanRevision:0,requestId,changeRequest:''}
 await store.prd(request)
 const {changeRequest,...candidate}=request
 await store.prd({...candidate,operationId:randomUUID(),type:'prd_candidate',draft:{title:'Calculator',summary:'A private local calculator.',requirements:[{key:'R1',outcome:'Perform arithmetic locally',scope:'required',priority:'high',exclusions:['No network'],openQuestions:[],sourceFields:['needs','success'],criteria:[{key:'C1',description:'Performed arithmetic checks pass',method:'tool_check',blocking:true}]}],assumptions:[],openQuestions:[]}})
 let snapshot=await store.read(projectId)
 snapshot=await store.prd({...candidate,operationId:randomUUID(),type:'prd_approve',expectedSequence:snapshot.sequence,expectedPlanRevision:snapshot.prd.revision,reviewedMeaningHash:snapshot.prd.meaningHash})
 const activation={projectId,sessionId,operationId:randomUUID(),type:'activate',expectedSequence:snapshot.sequence,expectedPlanRevision:snapshot.prd.revision,reviewedMeaningHash:snapshot.prd.meaningHash,selectedTotal:1,workspaceRoot:workspace,nativeSessionId:sessionId,capabilityProfileDigest:'a'.repeat(64)}
 return {base,root,workspace,store,projectId,activation,save}
}

test('workflow discovery returns an actual native Python with isolated sqlite3 support',async()=>{
 const result=spawnSync(python,['-I','-X','utf8','-c','import sys,sqlite3,json; print(json.dumps([sys.platform,list(sys.version_info[:2])]))'],{encoding:'utf8',windowsHide:true})
 assert.equal(result.status,0,result.stderr)
 const [host,version]=JSON.parse(result.stdout);assert.equal(host,process.platform);assert.ok(version[0]===3&&version[1]>=11)
})

test('an explicit invalid interpreter holds instead of silently falling back',async()=>{
 const previous=process.env.AMIRAHCO_PYTHON
 try{
  process.env.AMIRAHCO_PYTHON='python --some-shell-flag';await assert.rejects(resolveWorkflowPython,/absolute Python executable/)
  process.env.AMIRAHCO_PYTHON=process.execPath;await assert.rejects(resolveWorkflowPython,/unavailable or incompatible/)
  process.env.AMIRAHCO_PYTHON=python;assert.equal(await resolveWorkflowPython(),python)
 }finally{if(previous===undefined)delete process.env.AMIRAHCO_PYTHON;else process.env.AMIRAHCO_PYTHON=previous}
})

test('handoff command quoting preserves spaces, apostrophes and shell metacharacters',()=>{
 const values=["a b'c",'dollar$ and `ticks` ; & | $(echo unsafe)','C:\\folder with spaces\\file.json']
 const command=runtimeCommand(process.execPath,['-e','process.stdout.write(JSON.stringify(process.argv.slice(1)))',...values])
 const result=process.platform==='win32'?spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true}):spawnSync('/bin/sh',['-c',command],{encoding:'utf8'})
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),values)
})

test('native Build binds the same activation/run after interpreter outage, restart and Stop',async()=>{
 const f=await fixture();let store=f.store
 try{
  const snapshot=await store.activate(f.activation),db=join(f.root,f.projectId,'foundry.sqlite')
  await assert.rejects(()=>bindFoundryActivation(store,snapshot,()=>false),/stopped or changed/)
  await assert.rejects(()=>stat(db),{code:'ENOENT'})
  const previous=process.env.AMIRAHCO_PYTHON
  try{process.env.AMIRAHCO_PYTHON=join(f.base,'missing-python.exe');await assert.rejects(()=>bindFoundryActivation(store,snapshot),/unavailable/)}finally{if(previous===undefined)delete process.env.AMIRAHCO_PYTHON;else process.env.AMIRAHCO_PYTHON=previous}
  await assert.rejects(()=>stat(db),{code:'ENOENT'})
  const binding=await bindFoundryActivation(store,snapshot)
  assert.equal(binding.runId,snapshot.activation.activationId);assert.equal(binding.inspection.run.current_node,'admission')
  await assert.rejects(()=>admitFoundry(binding,'control','default',snapshot.activation.nativeSessionId,'configured/model',()=>false),/stopped or changed/)
  const stopped=await store.save({...f.save,create:false,type:'stop',operationId:randomUUID(),expectedSequence:snapshot.sequence,answers:snapshot.answers})
  await assert.rejects(()=>bindFoundryActivation(store,snapshot),/unstopped/)
  await store.close();store=new IntakeStore(f.root)
  assert.equal((await store.read(f.projectId)).stopped,true)
  const resumed=await store.save({...f.save,create:false,type:'resume',operationId:randomUUID(),expectedSequence:stopped.sequence,answers:stopped.answers})
  const reopened=await bindFoundryActivation(store,resumed)
  assert.equal(reopened.runId,binding.runId);assert.equal(reopened.inspection.run.revision,binding.inspection.run.revision)
  const admitted=await admitFoundry(reopened,`activation:${resumed.activation.activationId}@${resumed.activation.revision}`,'default',resumed.activation.nativeSessionId,'configured/model')
  assert.equal(admitted.current_node,'work')
  await store.close();store=new IntakeStore(f.root)
  const again=await bindFoundryActivation(store,await store.read(f.projectId))
  assert.equal(again.runId,binding.runId);assert.equal(again.inspection.run.current_node,'work');assert.equal(again.inspection.run.revision,admitted.revision)
  assert.ok(getBundledWorkflowPaths())
 }finally{await store.close()}
})

test('a later intake change fences the stale activation before any Foundry database is created',async()=>{
 const f=await fixture()
 try{
  const active=await f.store.activate(f.activation)
  await f.store.save({...f.save,create:false,operationId:randomUUID(),expectedSequence:active.sequence,answers:{...active.answers,needs:'A changed local-only scope'}})
  await assert.rejects(()=>bindFoundryActivation(f.store,active),/unstopped/)
  await assert.rejects(()=>stat(join(f.root,f.projectId,'foundry.sqlite')),{code:'ENOENT'})
 }finally{await f.store.close()}
})

test('Windows workspace admission rejects Linux, relative, missing and junction bindings', {skip:process.platform!=='win32'},async()=>{
 const f=await fixture()
 try{
  for(const workspaceRoot of ['/workspace/linux','relative',join(f.base,'missing'),'\\\\server\\share'])await assert.rejects(()=>f.store.activate({...f.activation,operationId:randomUUID(),workspaceRoot}))
  const alias=join(f.base,'junction');await symlink(f.workspace,alias,'junction')
  await assert.rejects(()=>f.store.activate({...f.activation,operationId:randomUUID(),workspaceRoot:alias}),{code:'UNSAFE_PATH'})
  const active=await f.store.activate(f.activation);assert.equal(active.activation.workspaceRoot,f.workspace)
  assert.equal((await f.store.activate(f.activation)).activation.activationId,active.activation.activationId)
 }finally{await f.store.close()}
})
