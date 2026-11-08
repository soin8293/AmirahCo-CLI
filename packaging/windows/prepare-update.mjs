import {createHash, createPrivateKey, createPublicKey, sign} from 'node:crypto'
import {createReadStream, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, statSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createWindowsUpdater} from '../../bin/windows-updater.mjs'

const read = path => JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''))
const here = dirname(fileURLToPath(import.meta.url))

export async function prepareUpdate(config) {
  const current=read(config.currentPolicy)
  const key=current.keys?.find(key=>key.id===config.keyId)
  let keyBytes
  if(config.privateKeyDpapi) {
    const opened=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(here,'read-signing-key.ps1'),'-ProtectedKey',resolve(config.privateKeyDpapi)],{windowsHide:true,timeout:30000})
    if(opened.error || opened.status!==0) throw new Error('The protected signing key could not be opened by this Windows account.')
    keyBytes=opened.stdout
  }else keyBytes=readFileSync(config.privateKey)
  let privateKey
  try {privateKey=createPrivateKey(keyBytes)} finally {keyBytes.fill(0)}
  if(!key || privateKey.asymmetricKeyType!=='ed25519' || createPublicKey(privateKey).export({format:'pem',type:'spki'})!==createPublicKey(key.publicKey).export({format:'pem',type:'spki'})) throw new Error('Signing key does not match the installed trust policy.')
  const bytes=statSync(config.archive).size
  if(bytes<=0 || bytes>600*1024**2) throw new Error('Archive exceeds the update size limit.')
  const env={...process.env}
  for(const name of Object.keys(env)) if(name.toLowerCase()==='psmodulepath') delete env[name]
  env.PSModulePath=join(env.SystemRoot ?? 'C:\\Windows','System32','WindowsPowerShell','v1.0','Modules')
  const inspected=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(here,'inspect-update.ps1'),'-Archive',resolve(config.archive)],{encoding:'utf8',windowsHide:true,timeout:180000,env})
  if(inspected.error || inspected.status!==0) throw new Error('Archive identity inspection failed: '+(inspected.stderr ?? '').trim())
  const target=JSON.parse(inspected.stdout.replace(/^\uFEFF/,''))
  const policy=target.policy
  if(!Number.isSafeInteger(current.sequence) || current.sequence<0 || policy.product!==current.product || policy.platform!==current.platform || policy.channel!==current.channel || policy.stateSchema!==current.stateSchema || policy.feed!==current.feed || !policy.keys?.some(candidate=>candidate.id===key.id && candidate.publicKey===key.publicKey)) throw new Error('Packaged policy does not preserve the installed update trust.')
  const hash=createHash('sha256')
  for await(const chunk of createReadStream(config.archive)) hash.update(chunk)
  const manifest={product:policy.product,platform:policy.platform,channel:policy.channel,stateSchema:policy.stateSchema,sequence:policy.sequence,version:target.version,directory:`${target.version}-pilot.${policy.sequence}`,url:config.url,sha256:hash.digest('hex'),bytes,unpackedBytes:Math.max(bytes,target.unpackedBytes),notes:config.notes,expiresAt:config.expiresAt}
  const payload=Buffer.from(JSON.stringify(manifest))
  const envelope={keyId:key.id,payload:payload.toString('base64'),signature:sign(null,payload,privateKey).toString('base64')}
  // Exercise the shipped verifier offline; no feed or package request is sent.
  const temporary=mkdtempSync(join(tmpdir(),'amr-release-check-'))
  const originalFetch=globalThis.fetch
  try {
    mkdirSync(join(temporary,'app','assets'),{recursive:true})
    writeFileSync(join(temporary,'app','assets','update-policy.json'),JSON.stringify(current))
    globalThis.fetch=async()=>new Response(JSON.stringify(envelope))
    const result=await createWindowsUpdater({appDir:join(temporary,'app')}).check(true)
    if(result.kind!=='available') throw new Error('Package is not a newer configured update.')
  }finally{
    globalThis.fetch=originalFetch
    if(dirname(temporary)===resolve(tmpdir())) rmSync(temporary,{recursive:true})
  }
  writeFileSync(config.output,JSON.stringify(envelope,null,2)+'\n',{flag:'wx'})
  return {sequence:manifest.sequence,version:manifest.version,sha256:manifest.sha256,bytes,published:false}
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if(process.argv.length!==3) throw new Error('Usage: node packaging/windows/prepare-update.mjs <release-config.json>')
    console.log(JSON.stringify(await prepareUpdate(read(process.argv[2]))))
  }catch(error){console.error(error.message);process.exitCode=1}
}
