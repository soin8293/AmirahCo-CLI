import {test} from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPairSync,verify,createHash} from 'node:crypto'
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {prepareUpdate} from '../packaging/windows/prepare-update.mjs'

test('release preparation binds the actual archive and enforces installed trust without publication',{skip:process.platform!=='win32'},async()=>{
 const root=mkdtempSync(join(tmpdir(),'amr-release-fixture-'))
 const pair=generateKeyPairSync('ed25519')
 const current={product:'amirahco-cli',platform:'windows-x64',channel:'pilot',stateSchema:1,sequence:6,feed:'https://updates.example.test/pilot.json',keys:[{id:'fixture',publicKey:pair.publicKey.export({format:'pem',type:'spki'})}]}
 const config={currentPolicy:join(root,'current.json'),privateKey:join(root,'key.pem'),keyId:'fixture',archive:join(root,'package.zip'),url:'https://updates.example.test/packages/r7.zip',notes:'A tested fixture update.',expiresAt:new Date(Date.now()+86400000).toISOString(),output:join(root,'feed.json')}
 writeFileSync(config.currentPolicy,JSON.stringify(current))
 writeFileSync(config.privateKey,pair.privateKey.export({format:'pem',type:'pkcs8'}))
 const script=join(root,'fixture.ps1')
 writeFileSync(script,`
param([string]$Root)
$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$policy=Get-Content -LiteralPath (Join-Path $Root 'target.json') -Raw
$payload=[IO.Compression.ZipFile]::Open((Join-Path $Root 'payload.zip'),[IO.Compression.ZipArchiveMode]::Create)
try {
 foreach($item in @(@('app/assets/update-policy.json',$policy),@('app/package.json','{"version":"1.0.2"}'))){
  $entry=$payload.CreateEntry($item[0]);$writer=New-Object IO.StreamWriter($entry.Open())
  try{$writer.Write($item[1])}finally{$writer.Dispose()}
 }
}finally{$payload.Dispose()}
$outer=[IO.Compression.ZipFile]::Open((Join-Path $Root 'package.zip'),[IO.Compression.ZipArchiveMode]::Create)
try {
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($outer,(Join-Path $Root 'payload.zip'),'payload.zip') | Out-Null
 foreach($name in @('install.ps1','install.cmd','README.txt')){$entry=$outer.CreateEntry($name);$writer=New-Object IO.StreamWriter($entry.Open());try{$writer.Write('fixture')}finally{$writer.Dispose()}}
}finally{$outer.Dispose()}
`)
 writeFileSync(join(root,'target.json'),JSON.stringify({...current,sequence:7}))
 const built=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Root',root],{encoding:'utf8',windowsHide:true})
 assert.equal(built.status,0,built.stderr)
 const receipt=await prepareUpdate(config)
 assert.equal(receipt.sequence,7);assert.equal(receipt.published,false)
 const envelope=JSON.parse(readFileSync(config.output,'utf8'))
 const payload=Buffer.from(envelope.payload,'base64')
 assert.equal(verify(null,payload,pair.publicKey,Buffer.from(envelope.signature,'base64')),true)
 const manifest=JSON.parse(payload)
 assert.equal(manifest.sha256,createHash('sha256').update(readFileSync(config.archive)).digest('hex'))
 assert.equal(manifest.directory,'1.0.2-pilot.7')
 assert.ok(manifest.unpackedBytes>=manifest.bytes)
 const protectedKey=join(root,'key.dpapi')
 const protectedResult=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';$env:PSModulePath=Join-Path $PSHOME 'Modules';Add-Type -AssemblyName System.Security;$plain=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd());[IO.File]::WriteAllBytes($env:AMR_TEST_PROTECTED_KEY,[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))"],{input:readFileSync(config.privateKey),windowsHide:true,env:{...process.env,AMR_TEST_PROTECTED_KEY:protectedKey}})
 assert.equal(protectedResult.status,0)
 const protectedOutput=join(root,'protected-feed.json')
 await prepareUpdate({...config,privateKeyDpapi:protectedKey,output:protectedOutput})
 assert.deepEqual(JSON.parse(readFileSync(protectedOutput,'utf8')),envelope)
 await assert.rejects(prepareUpdate(config),/EEXIST/)
 for(const [label,override,expected] of [
  ['cross-origin',{url:'https://other.example.test/r7.zip'},/Untrusted update address/],
  ['insecure',{url:'http://updates.example.test/r7.zip'},/Untrusted update address/],
  ['expired',{expiresAt:'2020-01-01T00:00:00Z'},/expired, incompatible or invalid/],
  ['unknown-key',{keyId:'unknown'},/Signing key/]
 ]){
  const output=join(root,label+'.json')
  await assert.rejects(prepareUpdate({...config,...override,output}),expected)
  assert.equal(existsSync(output),false)
 }
 const output=join(root,'inactive.json')
 writeFileSync(config.currentPolicy,JSON.stringify({...current,feed:null}))
 await assert.rejects(prepareUpdate({...config,output}),/preserve the installed update trust/)
 assert.equal(existsSync(output),false)
 writeFileSync(config.currentPolicy,JSON.stringify({...current,sequence:7}))
 await assert.rejects(prepareUpdate({...config,output}),/not a newer/)
 assert.equal(existsSync(output),false)
 assert.deepEqual(JSON.parse(readFileSync(config.output,'utf8')),envelope)
 writeFileSync(config.currentPolicy,JSON.stringify(current))
 const corrupt=join(root,'corrupt.zip');writeFileSync(corrupt,'not a package')
 await assert.rejects(prepareUpdate({...config,archive:corrupt,output}),/Archive identity inspection failed/)
 assert.equal(existsSync(output),false)
 const wrong=generateKeyPairSync('ed25519')
 writeFileSync(config.privateKey,wrong.privateKey.export({format:'pem',type:'pkcs8'}))
 await assert.rejects(prepareUpdate({...config,output}),/Signing key does not match/)
 assert.equal(existsSync(output),false)
})
