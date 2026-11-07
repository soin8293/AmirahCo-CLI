import {test} from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPairSync,sign,createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createWindowsUpdater} from '../bin/windows-updater.mjs'

const hash=data=>createHash('sha256').update(data).digest('hex')
async function fixture(t) {
 const root=mkdtempSync(join(tmpdir(),'amr-update-'))
 const app=join(root,'old');mkdirSync(join(app,'assets'),{recursive:true})
 const {publicKey,privateKey}=generateKeyPairSync('ed25519')
 let envelope;let archive=Buffer.from('approved fixture archive');let mode='normal';let requests=0
 const server=createServer((req,res)=>{
  requests++
  if(req.url==='/feed'){res.end(JSON.stringify(envelope));return}
  if(mode==='truncate'){res.write(archive.subarray(0,5));res.destroy();return}
  res.end(mode==='corrupt' ? Buffer.alloc(archive.length) : archive)
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 t.after(()=>{server.closeAllConnections();server.close()})
 const origin=`http://127.0.0.1:${server.address().port}`
 const policy={product:'amirahco-cli',channel:'pilot',platform:'windows-x64',sequence:5,stateSchema:1,feed:origin+'/feed',keys:[{id:'test',publicKey:publicKey.export({type:'spki',format:'pem'})}]}
 const policyFile=join(app,'assets','update-policy.json')
 writeFileSync(policyFile,JSON.stringify(policy))
 const manifest={product:policy.product,channel:policy.channel,platform:policy.platform,stateSchema:1,sequence:6,version:'1.0.1',directory:'new',url:origin+'/package',sha256:hash(archive),bytes:archive.length,unpackedBytes:1000,notes:'A small tested update.',expiresAt:new Date(Date.now()+3600000).toISOString()}
 function publish(changes={}) {Object.assign(manifest,changes);const bytes=Buffer.from(JSON.stringify(manifest));envelope={keyId:'test',payload:bytes.toString('base64'),signature:sign(null,bytes,privateKey).toString('base64')};return envelope}
 publish()
 const sentinel=join(root,'saved-project.json')
 const saved=JSON.stringify({session:'original',unfinished:['task-1'],stop:true,credits:0,change:'pending'})
 writeFileSync(sentinel,saved)
 const install=(offer,mode)=>{
  mkdirSync(join(root,offer.manifest.directory,'assets'),{recursive:true})
  writeFileSync(join(root,offer.manifest.directory,'assets','update-policy.json'),JSON.stringify({...policy,sequence:offer.manifest.sequence}))
  writeFileSync(join(root,offer.manifest.directory,'artifact'),offer.digest)
  if(mode==='Commit') for(const name of ['desktop','start-menu']) writeFileSync(join(root,name),offer.manifest.directory)
 }
 const options={appDir:app,allowLoopback:true,skipProcessScan:true,cacheMs:0,install,health:()=>`${manifest.version} (AmirahCo CLI)`}
 return {root,app,policy,policyFile,manifest,publish,options,up:extra=>createWindowsUpdater({...options,...extra}),setMode:value=>{mode=value},setArchive:value=>{archive=value;publish({sha256:hash(archive),bytes:archive.length})},getEnvelope:()=>envelope,requests:()=>requests,assertPreserved:()=>assert.equal(readFileSync(sentinel,'utf8'),saved)}
}
test('no channel configured performs no network or state writes',async()=>{
 const app=mkdtempSync(join(tmpdir(),'amr-unconfigured-'))
 const updater=createWindowsUpdater({appDir:app})
 assert.equal((await updater.check()).kind,'unconfigured')
 assert.equal((await updater.reconcile()).kind,'idle')
 assert.deepEqual(readdirSync(app),[])
})
test('approval downloads only; a fresh updater reconciles same identity and preserves work',async t=>{
 const f=await fixture(t);const offer=await f.up().check()
 assert.equal(offer.kind,'available');await f.up().approve(offer.digest)
 assert.equal(existsSync(join(f.root,'new')),false)
 assert.equal((await f.up().reconcile()).kind,'installed')
 assert.equal(f.up().selectedApp(),join(f.root,'new'))
 assert.equal((await f.up().reconcile()).kind,'idle')
 assert.equal(readFileSync(join(f.root,'desktop'),'utf8'),'new')
 assert.equal(readFileSync(join(f.root,'start-menu'),'utf8'),'new')
 f.assertPreserved()
})
test('signature, downgrade, conflicting head, wrong product/schema/origin and expired manifest are rejected',async t=>{
 const f=await fixture(t);const offer=await f.up().check()
 for(const changes of [{sequence:4},{notes:'altered same sequence'},{product:'other'},{stateSchema:2},{url:'http://example.com/package'},{expiresAt:'2020-01-01T00:00:00Z'}]) {
  const previous={...f.manifest};f.publish(changes)
  await assert.rejects(f.up().check())
  f.publish(previous)
 }
 const env=f.getEnvelope();env.signature=Buffer.alloc(64).toString('base64')
 await assert.rejects(f.up().check(),/signature/)
 assert.equal(existsSync(join(f.root,'new')),false)
 f.assertPreserved();assert.ok(offer.digest)
})
test('corrupt or interrupted download can retry original offer without installation',async t=>{
 const f=await fixture(t);const offer=await f.up().check()
 f.setMode('corrupt');await assert.rejects(f.up().approve(offer.digest),/signed manifest/)
 f.setMode('truncate');await assert.rejects(f.up().approve(offer.digest))
 assert.equal(existsSync(join(f.root,'new')),false)
 f.setMode('normal');await f.up().approve(offer.digest)
 const journal=JSON.parse(readFileSync(join(f.root,'.updates','intent.json')))
 assert.equal(journal.digest,offer.digest);assert.equal(journal.phase,'approved');f.assertPreserved()
})
test('bounded storage limit, busy session, failed health and saved-package tamper preserve selection',async t=>{
 const f=await fixture(t);const offer=await f.up().check()
 await assert.rejects(f.up({freeBytes:()=>0}).approve(offer.digest),/free space/)
 await f.up().approve(offer.digest)
 mkdirSync(join(f.root,'.updates','sessions'),{recursive:true})
 writeFileSync(join(f.root,'.updates','sessions','123456.json'),'{}')
 assert.equal((await f.up({alive:()=>true}).reconcile()).kind,'held')
 await assert.rejects(f.up({alive:()=>false,health:()=> 'broken'}).reconcile(),/launch check/)
 assert.equal(existsSync(join(f.root,'.updates','selection.json')),false)
 assert.equal(existsSync(join(f.root,'desktop')),false)
 writeFileSync(join(f.root,'.updates',offer.digest,'package.zip'),'tampered')
 await assert.rejects(f.up({alive:()=>false}).reconcile(),/verification failed/)
 f.assertPreserved()
})
for(const phase of ['installing','staged','shortcuts','selected']) test(`actual process crash at ${phase} recovers without changing action or unfinished work`,async t=>{
 const f=await fixture(t);const offer=await f.up().check();await f.up().approve(offer.digest)
 const child=join(f.root,'crash.mjs')
 writeFileSync(child,`import {createWindowsUpdater} from ${JSON.stringify(new URL('../bin/windows-updater.mjs',import.meta.url).href)}; import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';const root=${JSON.stringify(f.root)};await createWindowsUpdater({appDir:${JSON.stringify(f.app)},allowLoopback:true,skipProcessScan:true,health:()=> '1.0.1 (AmirahCo CLI)',install:(offer,mode)=>{mkdirSync(join(root,'new','assets'),{recursive:true});writeFileSync(join(root,'new','assets','update-policy.json'),JSON.stringify({...JSON.parse(readFileSync(join(root,'old','assets','update-policy.json'),'utf8')),sequence:6}));writeFileSync(join(root,'new','artifact'),offer.digest);if(mode==='Commit')for(const name of ['desktop','start-menu'])writeFileSync(join(root,name),'new')},failpoint:phase=>{if(phase===${JSON.stringify(phase)})process.exit(73)}}).reconcile()`)
 const result=spawnSync(process.execPath,[child],{encoding:'utf8',timeout:20000})
 assert.equal(result.status,73,result.stderr)
 assert.equal((await f.up().reconcile()).kind,'installed')
 assert.equal(JSON.parse(readFileSync(join(f.root,'.updates','intent.json'))).digest,offer.digest)
 assert.equal(f.up().selectedApp(),join(f.root,'new'));f.assertPreserved()
})
test('installed selection survives a later offer and expiration of the old offer',async t=>{
 const f=await fixture(t);let offer=await f.up().check();await f.up().approve(offer.digest);await f.up().reconcile()
 f.publish({sequence:7,version:'1.0.2',directory:'newer'})
 await f.up().check()
 assert.equal(f.up().selectedApp(),join(f.root,'new'));f.assertPreserved()
 const clock=Date.now
 try {Date.now=()=>clock()+7200000;assert.equal(f.up().selectedApp(),join(f.root,'new'))}finally{Date.now=clock}
})
test('an approval accepted before expiry recovers after expiry and from the new version shortcut',async t=>{
 const f=await fixture(t);const offer=await f.up().check();await f.up().approve(offer.digest)
 const clock=Date.now
 try {
  Date.now=()=>clock()+7200000
  await assert.rejects(f.up({failpoint:phase=>{if(phase==='shortcuts')throw new Error('interruption')}}).reconcile(),/interruption/)
  assert.equal((await f.up({appDir:join(f.root,'new')}).reconcile()).kind,'installed')
  assert.equal(f.up({appDir:join(f.root,'new')}).selectedApp(),null)
  f.assertPreserved()
 }finally{Date.now=clock}
})
for(const phase of ['downloading','ready']) test(`actual process crash at ${phase} retains original download identity`,async t=>{
 const f=await fixture(t);const offer=await f.up().check();await f.up().approve(offer.digest)
 if(phase==='downloading')writeFileSync(join(f.root,'.updates',offer.digest,'package.zip'),'partial')
 const child=join(f.root,'download-crash.mjs')
 writeFileSync(child,`import {createWindowsUpdater} from ${JSON.stringify(new URL('../bin/windows-updater.mjs',import.meta.url).href)};await createWindowsUpdater({appDir:${JSON.stringify(f.app)},allowLoopback:true,failpoint:phase=>{if(phase===${JSON.stringify(phase)})process.exit(73)}}).approve(${JSON.stringify(offer.digest)})`)
 const result=spawnSync(process.execPath,[child],{encoding:'utf8',timeout:20000})
 assert.equal(result.status,73,result.stderr)
 await f.up().approve(offer.digest)
 assert.equal(JSON.parse(readFileSync(join(f.root,'.updates','intent.json'))).digest,offer.digest)
 f.assertPreserved()
})
test('startup admission owns a lease and malformed recovery metadata holds without touching work',async t=>{
 const f=await fixture(t);const admitted=await f.up().enter()
 const lease=join(f.root,'.updates','sessions',process.pid+'.json')
 assert.equal(existsSync(lease),true);admitted.releaseLease();assert.equal(existsSync(lease),false)
 writeFileSync(join(f.root,'.updates','intent.json'),JSON.stringify({phase:'unknown'}))
 assert.equal((await f.up().enter()).kind,'held')
 f.assertPreserved()
})
test('production transport rejects loopback HTTP and policy cannot be overridden by project environment',async t=>{
 const f=await fixture(t)
 await assert.rejects(createWindowsUpdater({appDir:f.app}).check(),/Untrusted/)
 process.env.AMIRAHCO_UPDATE_FEED='http://example.com/evil'
 try {assert.equal((await f.up().check(true)).kind,'available')}finally{delete process.env.AMIRAHCO_UPDATE_FEED}
})
test('automatic checks share a bounded cache; explicit checks bypass it; development copies stay inert',async t=>{
 const f=await fixture(t)
 const updater=f.up({cacheMs:300000})
 await updater.check();const count=f.requests();await updater.check();assert.equal(f.requests(),count)
 await updater.check(true);assert.equal(f.requests(),count+1)
 writeFileSync(join(f.app,'.git'),'development worktree')
 assert.equal((await f.up().check()).kind,'unconfigured')
 f.assertPreserved()
})
test('Windows process inspection ignores an incompatible parent PowerShell module path',{skip:process.platform!=='win32'},async t=>{
 const f=await fixture(t);const offer=await f.up().check();await f.up().approve(offer.digest)
 const previous=process.env.PSModulePath
 try {
  process.env.PSModulePath='C:\\incompatible-parent-modules'
  const result=await f.up({skipProcessScan:false}).reconcile()
  assert.ok(['held','installed'].includes(result.kind))
  f.assertPreserved()
 }finally{if(previous===undefined)delete process.env.PSModulePath;else process.env.PSModulePath=previous}
})
