import { writeFileSync } from 'node:fs'
import { resolve,relative } from 'node:path'
import { connectRegisteredTester } from '../src/services/registeredTesterAccess.js'
import { connectTesterAccess } from '../src/services/hostedTesterAccess.js'
import { signInTesterGoogle } from '../src/services/testerGoogleSignIn.js'
import { enableConfigs } from '../src/utils/config.js'
import { getGlobalClaudeFile } from '../src/utils/env.js'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { addProviderProfile,getActiveProviderProfile,getProviderProfiles } from '../src/utils/providerProfiles.js'
import { loadProfileFile } from '../src/utils/providerProfile.js'
import { HOSTED_TESTER_PROFILE,testerEndpoint } from '../src/services/hostedTesterAccess.js'

const root=process.env.OPENCLAUDE_CONFIG_DIR,receipt=process.env.AMIRAHCO_ACCOUNT_TEST_RECEIPT
if(!root||!receipt||relative(resolve(root),resolve(getGlobalClaudeFile())).startsWith('..'))throw new Error('Isolated account fixture configuration required')
enableConfigs()
const save=(value:unknown)=>writeFileSync(receipt,JSON.stringify(value,null,2)+'\n',{mode:0o600})
const snapshot=()=>{
  const profiles=getProviderProfiles(),tester=profiles.filter(profile=>profile.name===HOSTED_TESTER_PROFILE)
  assert(tester.length===1&&tester[0]?.apiKey,'One saved tester profile required')
  const current=tester[0]
  assert(current&&getActiveProviderProfile()?.id===current.id,'Saved tester access is not active')
  assert(profiles.filter(profile=>profile.name==='Existing fixture provider').length===1,'Other fixture provider was not preserved')
  assert(loadProfileFile({configDir:root,cwd:root}),'Native startup profile is unavailable')
  return {profileId:current.id,profiles:profiles.length,activeTester:true,startupFile:true,
    keyDigest:createHash('sha256').update(current.apiKey).digest('hex'),endpoint:current.baseUrl,model:current.model}
}
try{
  if(process.argv[2]==='reopen'){
    const observed=snapshot(),active=getActiveProviderProfile()
    assert(active?.apiKey&&observed.endpoint===testerEndpoint(),'Saved credential or endpoint unavailable')
    const response=await fetch(testerEndpoint()+'/models',{headers:{Authorization:'Bearer '+active.apiKey},redirect:'error',signal:AbortSignal.timeout(15000)})
    assert(response.ok,'Reopened credential was refused by public HTTPS')
    const catalogue=z.object({data:z.array(z.object({id:z.string()}))}).parse(await response.json())
    assert(catalogue.data.some(model=>model.id==='auto:amirahco-partners'),'Reopened scoped catalogue is missing')
    save({state:'completed',result:'reopened',...observed,nativeRuntime:process.version,physicalUI:false})
    console.log('Native saved account access reopened through public HTTPS')
  }else{
  if(!getProviderProfiles().some(profile=>profile.name==='Existing fixture provider'))
    addProviderProfile({provider:'openai',name:'Existing fixture provider',baseUrl:'https://existing.example/v1',model:'existing',apiKey:'fixture-existing'},{makeActive:true})
  const controller=new AbortController()
  const result=await connectRegisteredTester({signal:controller.signal}, {
    fetch:(url,init)=>globalThis.fetch(url,init),connect:connectTesterAccess,
    signIn:options=>signInTesterGoogle({...options,openUrl:async url=>{save({state:'waiting_google',url});return true}}),
  })
  save({state:'completed',result,...(result==='connected'?snapshot():{}),nativeRuntime:process.version,physicalUI:false})
  console.log('Native account result: '+result)
  }
}catch{save({state:'held',nativeRuntime:process.version,credentialOutput:false});process.exitCode=1}
