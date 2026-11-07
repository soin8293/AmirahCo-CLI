import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { getGlobalClaudeFile } from '../src/utils/env.js'
import { getActiveProviderProfile, getProviderProfiles, addProviderProfile, updateProviderProfile, setActiveProviderProfile } from '../src/utils/providerProfiles.js'
import { connectTesterAccess, HOSTED_TESTER_PROFILE } from '../src/services/hostedTesterAccess.js'
import { loadProfileFile } from '../src/utils/providerProfile.js'
import { enableConfigs } from '../src/utils/config.js'

const root = process.env.OPENCLAUDE_CONFIG_DIR
assert(root && resolve(getGlobalClaudeFile()).startsWith(resolve(root)))
assert(process.env.NODE_ENV !== 'test')
enableConfigs()
const mode = process.argv[2]
const live = mode?.startsWith('live-')
const key = live ? readFileSync(0,'utf8').trim() : 'sk-tp-' + 'b'.repeat(48)
const endpoint = process.env.AMIRAHCO_TESTER_BASE_URL ?? 'https://testers.example/v1'
if (mode === 'save' || mode === 'live-save') {
  addProviderProfile({provider:'openai',name:'Existing fixture provider',baseUrl:'https://existing.example/v1',model:'existing',apiKey:'fixture-existing'}, {makeActive:true})
  await connectTesterAccess(key, {endpoint,signal:new AbortController().signal}, live ? undefined : {
    fetch: async()=>Response.json({data:[{id:'auto:amirahco-partners'}]}),
    readProfiles:getProviderProfiles, add:addProviderProfile, update:updateProviderProfile,
    active:getActiveProviderProfile, activate:setActiveProviderProfile,
  })
}
const profiles = getProviderProfiles()
const tester = profiles.filter(profile=>profile.name===HOSTED_TESTER_PROFILE)
assert.equal(tester.length,1)
assert(tester[0]?.apiKey===key,'Saved tester credential differs')
assert.equal(tester[0]?.baseUrl,endpoint)
assert.equal(getActiveProviderProfile()?.id,tester[0]?.id)
assert.equal(profiles.filter(profile=>profile.name==='Existing fixture provider').length,1)
assert(loadProfileFile({configDir:root,cwd:root}))
console.log(JSON.stringify({mode,profiles:profiles.length,activeTester:true,startupFile:true}))
