import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,stat,rename,link,symlink,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'

if(process.platform!=='win32')throw new Error('Run this receiving suite with native Windows Node.')
const {IntakeStore,intakeStateRoot}=await import(process.env.AMIRAHCO_INTAKE_TEST_MODULE)
const fixture=async()=>join(await mkdtemp(join(tmpdir(),'amirahco-windows-boundary-')),'private records with spaces')
const save=id=>({projectId:id,operationId:randomUUID(),sessionId:'native-windows-boundary',type:'save',expectedSequence:0,answers:{idea:'Preserve native Windows state',helpers:'1'},step:2,phase:'intake',create:true})

test('Windows default state is app-owned and portable override must stay Windows-local',()=>{
 const old=process.env.XDG_STATE_HOME,local=process.env.LOCALAPPDATA
 try{
  delete process.env.XDG_STATE_HOME
  assert.equal(intakeStateRoot(),join(local,'AmirahCo CLI','state','projects'))
  process.env.XDG_STATE_HOME='\\\\server\\share'
  assert.throws(()=>intakeStateRoot(),{code:'HOST'})
  process.env.XDG_STATE_HOME='/home/not-a-windows-state-root'
  assert.throws(()=>intakeStateRoot(),{code:'HOST'})
 }finally{if(old===undefined)delete process.env.XDG_STATE_HOME;else process.env.XDG_STATE_HOME=old}
})

test('existing inherited/broad root is refused without rewriting its ACL or user files',async()=>{
 const root=await fixture();await mkdir(root);await writeFile(join(root,'owner-note.txt'),'keep this')
 const store=new IntakeStore(root),id=randomUUID()
 try{
  await assert.rejects(()=>store.save(save(id)),{code:'PRIVATE_PATH'})
  assert.equal(await readFile(join(root,'owner-note.txt'),'utf8'),'keep this')
  await assert.rejects(()=>stat(join(root,id,'project-records.sqlite')))
 }finally{await store.close()}
})

test('active database cannot be renamed/replaced; close releases native guards',async()=>{
 const root=await fixture(),id=randomUUID(),store=new IntakeStore(root)
 await store.save(save(id))
 const file=join(root,id,'project-records.sqlite'),backup=file+'.preserved'
 try{
  await assert.rejects(()=>rename(file,backup))
  assert.equal((await store.read(id)).answers.idea,'Preserve native Windows state')
 }finally{await store.close()}
 await rename(file,backup)
 assert.ok((await stat(backup)).isFile())
 const reopened=new IntakeStore(root)
 try{await assert.rejects(()=>reopened.read(id));await assert.rejects(()=>stat(file))}finally{await reopened.close()}
})

test('held private directory cannot be replaced; shutdown releases ancestor handles',async()=>{
 const root=await fixture(),id=randomUUID(),store=new IntakeStore(root)
 await store.save(save(id))
 try{await assert.rejects(()=>rename(root,root+'.preserved'))}finally{await store.close()}
 await rename(root,root+'.preserved')
 assert.ok((await stat(join(root+'.preserved',id,'project-records.sqlite'))).isFile())
})

test('reopened database with an extra hardlink fails identity checks',async()=>{
 const root=await fixture(),id=randomUUID();let store=new IntakeStore(root)
 await store.save(save(id));await store.close()
 const file=join(root,id,'project-records.sqlite');await link(file,join(root,id,'foreign-alias.sqlite'))
 store=new IntakeStore(root)
 try{await assert.rejects(()=>store.read(id),{code:'IDENTITY'})}finally{await store.close()}
})

test('junction ancestors fail closed before creating a project database',async()=>{
 const root=await fixture(),require=createRequire(import.meta.url)
 const nativeSource=await readFile(new URL('../src/services/projectRecords/windowsStorage.cjs',import.meta.url),'utf8')
 const platform=new Function('require',`${nativeSource};return createWindowsStorage`)(require)(root,require.resolve('koffi'))
 try{platform.mkdir(root)}finally{platform.close()}
 const alias=root+'.alias';await symlink(root,alias,'junction')
 const store=new IntakeStore(join(alias,'child')),id=randomUUID()
 try{await assert.rejects(()=>store.save(save(id)),{code:'UNSAFE_PATH'});await assert.rejects(()=>stat(join(root,'child',id)))}finally{await store.close()}
})


test('an idle storage child does not keep its parent alive or retain guards after parent exit',async()=>{
 const root=await fixture(),id=randomUUID()
 const script=`const {IntakeStore}=await import(${JSON.stringify(process.env.AMIRAHCO_INTAKE_TEST_MODULE)});const store=new IntakeStore(${JSON.stringify(root)});await store.save(${JSON.stringify(save(id))});`
 const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:10000,env:process.env})
 assert.equal(child.status,0,child.stderr||String(child.error))
 let moved=false
 for(let attempt=0;attempt<20;attempt++){
  try{await rename(root,root+'.preserved');moved=true;break}catch(error){if(attempt===19)throw error;await new Promise(resolve=>setTimeout(resolve,50))}
 }
 assert.equal(moved,true)
})
