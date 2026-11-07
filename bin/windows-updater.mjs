import {createHash, createPublicKey, verify} from 'node:crypto'
import {existsSync, readFileSync, renameSync, mkdirSync, unlinkSync, readdirSync, statfsSync, openSync, writeSync, fsyncSync, closeSync, createReadStream} from 'node:fs'
import {open, rename} from 'node:fs/promises'
import {dirname, join, resolve, basename} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'

const sha = data => createHash('sha256').update(data).digest('hex')
async function fileHash(path) {const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex')}
const read = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
function atomic(path, value) {
  mkdirSync(dirname(path), {recursive:true})
  const temporary = path + '.next'
  const fd = openSync(temporary, 'w')
  try { writeSync(fd, JSON.stringify(value)); fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(temporary, path)
}
const alive = pid => {
  try { process.kill(pid, 0); return true } catch(error) { return error.code !== 'ESRCH' }
}
function run(command, args, options={}) {
  const environment={...(options.env ?? process.env)}
  if(basename(command).toLowerCase()==='powershell.exe') {
    for(const key of Object.keys(environment))if(key.toLowerCase()==='psmodulepath')delete environment[key]
    environment.PSModulePath=join(environment.SystemRoot ?? 'C:\\Windows','System32','WindowsPowerShell','v1.0','Modules')
  }
  const result = spawnSync(command, args, {windowsHide:true, encoding:'utf8', timeout:180000, ...options,env:environment})
  if(result.error || result.status !== 0) throw new Error('Update verification or installation could not finish. Your current version is preserved.')
  return result.stdout.trim()
}

export function createWindowsUpdater(options={}) {
  const appDir = resolve(options.appDir ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
  const policyPath = join(appDir, 'assets', 'update-policy.json')
  const policy = existsSync(policyPath) ? read(policyPath) : null
  const configured = policy?.product === 'amirahco-cli' && policy.channel === 'pilot' && policy.platform === 'windows-x64'
    && Number.isSafeInteger(policy.sequence) && policy.sequence >= 0 && policy.stateSchema === 1
    && typeof policy.feed === 'string' && Array.isArray(policy.keys) && policy.keys.length > 0 && !existsSync(join(appDir,'.git'))
  const installRoot = dirname(appDir)
  const store = join(installRoot, '.updates')
  const journalPath = join(store, 'intent.json')
  const headPath = join(store, 'head.json')
  const selectionPath = join(store, 'selection.json')
  const failpoint = options.failpoint ?? (()=>{})
  const live = options.alive ?? alive
  const assertUrl = (value, origin) => {
    const url = new URL(value)
    const loopback = options.allowLoopback === true && ['127.0.0.1', 'localhost'].includes(url.hostname)
    if((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) || url.username || url.password || url.hash || (origin && url.origin !== origin)) throw new Error('Untrusted update address.')
    return url
  }
  function decode(envelope, installed=false) {
    if(!configured) throw new Error('Updates are not configured for this build.')
    if(typeof envelope?.payload !== 'string' || envelope.payload.length > 65536 || typeof envelope.signature !== 'string') throw new Error('Invalid update manifest.')
    const key = policy.keys.find(key => key.id === envelope.keyId)
    const bytes = Buffer.from(envelope.payload, 'base64')
    if(!key || createPublicKey(key.publicKey).asymmetricKeyType !== 'ed25519' || !verify(null, bytes, key.publicKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('Update signature was not trusted.')
    const manifest = JSON.parse(bytes.toString('utf8'))
    if(manifest.product !== 'amirahco-cli' || manifest.channel !== policy.channel || manifest.platform !== policy.platform
      || manifest.stateSchema !== policy.stateSchema || !Number.isSafeInteger(manifest.sequence) || manifest.sequence < 1 || (!installed && manifest.sequence <= policy.sequence)
      || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)
      || !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(manifest.directory)
      || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 || manifest.bytes > 600*1024*1024
      || !Number.isSafeInteger(manifest.unpackedBytes) || manifest.unpackedBytes < manifest.bytes || manifest.unpackedBytes > 3*1024**3
      || typeof manifest.notes !== 'string' || manifest.notes.length > 2000 || /[\x00-\x08\x0b-\x1f\x7f]/.test(manifest.notes)
      || !Number.isFinite(Date.parse(manifest.expiresAt)) || (!installed && Date.parse(manifest.expiresAt) <= Date.now())) throw new Error('This update is expired, incompatible or invalid.')
    assertUrl(manifest.url, assertUrl(policy.feed).origin)
    const digest = sha(bytes)
    const head = existsSync(headPath) ? read(headPath) : null
    if(head && (!Number.isSafeInteger(head.sequence) || !/^[a-f0-9]{64}$/.test(head.digest))) throw new Error('Update channel head needs recovery.')
    if(!installed && head && (manifest.sequence < head.sequence || (manifest.sequence === head.sequence && digest !== head.digest))) throw new Error('An older or conflicting update was rejected.')
    return {manifest, digest, envelope}
  }
  async function locked(fn) {
    mkdirSync(store, {recursive:true})
    const lock = join(store, 'writer.lock')
    if(existsSync(lock)) {
      let owner
      try { owner = read(lock) } catch { throw new Error('Update recovery is held: an incomplete writer lock needs inspection.') }
      if(!Number.isSafeInteger(owner.pid) || live(owner.pid)) throw new Error('Another update operation is active.')
      unlinkSync(lock)
    }
    const fd = openSync(lock, 'wx')
    try { writeSync(fd, JSON.stringify({pid:process.pid})); fsyncSync(fd); return await fn() }
    finally { closeSync(fd); unlinkSync(lock) }
  }
  const intent = () => {
    if(!existsSync(journalPath)) return null
    const record=read(journalPath)
    if(!['offered','downloading','ready','approved','installing','installed'].includes(record.phase) || !/^[a-f0-9]{64}$/.test(record.digest) || typeof record.envelope?.payload !== 'string' || sha(Buffer.from(record.envelope.payload,'base64')) !== record.digest) throw new Error('Update intent needs recovery.')
    return record
  }
  const save = state => { atomic(journalPath,state); failpoint(state.phase) }
  async function check(force=false) {
    if(!configured) return {kind:'unconfigured', message:'Updates will be available here when the pilot release channel is ready.'}
    return locked(async()=>{
      const existing = intent()
      if(existing && ['approved','installing'].includes(existing.phase)) return {kind:'ready', ...decode(existing.envelope,true), message:'Update approved for the next safe launch.'}
      const cachePath=join(store,'check.json')
      const cache=existsSync(cachePath) ? read(cachePath) : null
      if(!force && cache?.retryAfter > Date.now()) {
        if(existing && ['offered','ready','downloading'].includes(existing.phase)) {
          try {const offer=decode(existing.envelope);return {kind:'available',...offer,message:`Update available: ${offer.manifest.version}. Use /update to review it.`}}catch{}
        }
        return {kind:'deferred',message:''}
      }
      atomic(cachePath,{retryAfter:Date.now()+(options.cacheMs ?? 300000)})
      const response = await fetch(assertUrl(policy.feed), {redirect:'error', signal:AbortSignal.timeout(5000)})
      if(!response.ok) throw new Error('The update service is unavailable. You can keep working.')
      const bytes = await bounded(response, 100000)
      const envelope = JSON.parse(bytes.toString('utf8'))
      // A signed feed may continue to advertise the currently installed release.
      if(envelope?.payload && envelope.keyId) {
        const candidate = JSON.parse(Buffer.from(envelope.payload,'base64').toString('utf8'))
        if(candidate.sequence <= policy.sequence) {
          const key = policy.keys.find(key=>key.id === envelope.keyId)
          if(!key || !verify(null, Buffer.from(envelope.payload,'base64'), key.publicKey, Buffer.from(envelope.signature ?? '', 'base64'))) throw new Error('Update signature was not trusted.')
          if(candidate.sequence === policy.sequence && candidate.product === policy.product && candidate.platform === policy.platform && candidate.channel === policy.channel && candidate.stateSchema === policy.stateSchema) return {kind:'current',message:'AmirahCo CLI is up to date.'}
        }
      }
      const offer = decode(envelope)
      atomic(headPath, {sequence:offer.manifest.sequence,digest:offer.digest})
      if(existing?.digest !== offer.digest || !['ready','downloading'].includes(existing.phase)) save({phase:'offered', ...offer})
      return {kind:'available', ...offer, message:`Update available: ${offer.manifest.version}. Use /update to review it.`}
    })
  }
  async function approve(digest) {
    return locked(async()=>{
      const existing = intent()
      if(!existing || existing.digest !== digest) throw new Error('The available update changed. Review it again.')
      const offer = decode(existing.envelope)
      const directory = join(store, offer.digest)
      mkdirSync(directory, {recursive:true})
      const archive = join(directory,'package.zip')
      const disk = statfsSync(store)
      const freeBytes=options.freeBytes ? options.freeBytes() : disk.bavail * disk.bsize
      if(freeBytes < offer.manifest.bytes + offer.manifest.unpackedBytes + 64*1024*1024) throw new Error('Not enough free space for a safe update. Your current version is preserved.')
      if(!existsSync(archive) || await fileHash(archive) !== offer.manifest.sha256) {
        save({phase:'downloading', ...offer})
        const response = await fetch(assertUrl(offer.manifest.url,assertUrl(policy.feed).origin), {redirect:'error',signal:AbortSignal.timeout(120000)})
        if(!response.ok) throw new Error('The update could not download. Try again when connected.')
        const temporary = archive+'.partial'
        const file = await open(temporary,'w')
        const hash = createHash('sha256')
        let size = 0
        try {
          for await(const chunk of response.body) {
            size += chunk.length
            if(size > offer.manifest.bytes) throw new Error('Update download exceeded its signed size.')
            hash.update(chunk); await file.writeFile(chunk)
          }
          await file.sync()
        } finally { await file.close() }
        if(size !== offer.manifest.bytes || hash.digest('hex') !== offer.manifest.sha256) throw new Error('The downloaded update did not match its signed manifest.')
        await rename(temporary,archive)
      }
      save({phase:'ready', ...offer})
      save({phase:'approved', ...offer, approvedAt:new Date().toISOString()})
      return {kind:'ready',message:'Update saved. Close your sessions normally; it will install on the next safe launch.'}
    })
  }
  function activeSessions() {
    const leases = join(store,'sessions')
    if(existsSync(leases)) for(const name of readdirSync(leases).filter(name=>name.endsWith('.json'))) {
      const pid = Number(name.replace(/\.json$/,''))
      if(!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Unknown session lease; update held.')
      if(pid !== process.pid && live(pid)) return true
    }
    // Older installed versions do not create leases. Unknown process visibility holds.
    if(process.platform === 'win32' && !options.skipProcessScan) {
      const output = run('powershell.exe', ['-NoProfile','-NonInteractive','-Command', '$ErrorActionPreference="Stop"; $busy=@(Get-CimInstance Win32_Process -Filter "Name = \'node.exe\'" | Where-Object { $_.ProcessId -ne [int]$env:AMIRAHCO_UPDATE_PID -and ((-not $_.CommandLine) -or $_.CommandLine.Contains($env:AMIRAHCO_UPDATE_ROOT)) }); if($busy.Count){"busy"}else{"idle"}'], {env:{...process.env,AMIRAHCO_UPDATE_PID:String(process.pid),AMIRAHCO_UPDATE_ROOT:installRoot}})
      if(output !== 'idle') return true
    }
    return false
  }
  const installer = options.install ?? ((offer, mode)=>{
    run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(appDir,'bin','windows-update-install.ps1'),'-UpdateRoot',join(store,offer.digest),'-InstallRoot',installRoot,'-VersionDirectory',offer.manifest.directory,'-Mode',mode])
  })
  async function reconcileLocked() {
      const existing = intent()
      if(!existing || !['approved','installing'].includes(existing.phase)) return {kind:'idle'}
      const offer = decode(existing.envelope,true)
      const approvedAt=Date.parse(existing.approvedAt)
      const head=existsSync(headPath) ? read(headPath) : null
      if(head && (!Number.isSafeInteger(head.sequence) || !/^[a-f0-9]{64}$/.test(head.digest))) throw new Error('Update channel head needs recovery.')
      if(!Number.isFinite(approvedAt) || approvedAt > Date.parse(offer.manifest.expiresAt) || offer.manifest.sequence < policy.sequence || (head && (head.sequence > offer.manifest.sequence || (head.sequence === offer.manifest.sequence && head.digest !== offer.digest)))) throw new Error('Approved update identity needs recovery.')
      if(activeSessions()) return {kind:'held',message:'Update saved; waiting for other AmirahCo CLI sessions to close.'}
      const archive = join(store,offer.digest,'package.zip')
      if(!existsSync(archive) || await fileHash(archive) !== offer.manifest.sha256) throw new Error('Saved update verification failed. The current version is preserved.')
      save({phase:'installing', ...offer, approvedAt:existing.approvedAt})
      await installer(offer,'Stage')
      failpoint('staged')
      const nextApp = join(installRoot,offer.manifest.directory)
      const nextPolicy=read(join(nextApp,'assets','update-policy.json'))
      if(nextPolicy.product !== policy.product || nextPolicy.channel !== policy.channel || nextPolicy.platform !== policy.platform || nextPolicy.sequence !== offer.manifest.sequence || nextPolicy.stateSchema !== policy.stateSchema || nextPolicy.feed !== policy.feed || !nextPolicy.keys?.some(key=>policy.keys.some(trusted=>trusted.id === key.id && trusted.publicKey === key.publicKey))) throw new Error('The installed release does not match the approved update channel.')
      const health = options.health ?? (()=>run(join(nextApp,'bin','node.exe'),[join(nextApp,'bin','amirahcocli'),'--version'],{env:{...process.env,OPENCLAUDE_CONFIG_DIR:join(store,offer.digest,'health-profile')}}))
      if(health(offer) !== `${offer.manifest.version} (AmirahCo CLI)`) throw new Error('The new version did not pass its launch check. Your current selection is preserved.')
      if(activeSessions()) return {kind:'held',message:'Update staged; another session opened. Installation will wait.'}
      await installer(offer,'Commit')
      failpoint('shortcuts')
      atomic(selectionPath,{directory:offer.manifest.directory,sequence:offer.manifest.sequence,digest:offer.digest,envelope:offer.envelope})
      failpoint('selected')
      save({phase:'installed', ...offer})
      return {kind:'installed',message:`AmirahCo CLI ${offer.manifest.version} is ready.`}
  }
  async function reconcile() {
    if(!configured) return {kind:'idle'}
    return locked(reconcileLocked)
  }
  function selectedApp() {
    if(!configured || !existsSync(selectionPath)) return null
    const selection = read(selectionPath)
    const offer = decode(selection.envelope,true)
    if(offer.digest !== selection.digest || offer.manifest.directory !== selection.directory) throw new Error('Update selection needs recovery.')
    if(selection.directory === basename(appDir)) return null
    return join(installRoot,offer.manifest.directory)
  }
  function lease() {
    if(!configured) return ()=>{}
    const path = join(store,'sessions',process.pid+'.json')
    atomic(path,{pid:process.pid})
    return ()=>{if(existsSync(path)) unlinkSync(path)}
  }
  async function enter() {
    if(!configured) return {kind:'idle',releaseLease:()=>{},selected:null}
    return locked(async()=>{
      let result
      try {result=await reconcileLocked()}
      catch {result={kind:'held',message:'An update could not finish. Your current version and work are preserved. Run /update to review it.'}}
      const releaseLease=lease()
      let selected=null
      try {selected=selectedApp()} catch {result={kind:'held',message:'Update selection needs recovery. Your current version and work are preserved.'}}
      return {...result,releaseLease,selected}
    })
  }
  return {check,approve,reconcile,selectedApp,lease,enter,configured}
}

async function bounded(response, limit) {
  const chunks=[]; let length=0
  for await(const chunk of response.body) { length+=chunk.length; if(length>limit) throw new Error('Update metadata exceeded its limit.'); chunks.push(chunk) }
  return Buffer.concat(chunks)
}

export async function runWindowsUpdateCommand() {
  try { console.log((await createWindowsUpdater().check(true)).message) }
  catch { console.error('Update check could not finish. Your current version and work are preserved.'); process.exitCode=1 }
}
