import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { openSync,writeSync,fsyncSync,closeSync,readFileSync } from 'node:fs'
import { relative,resolve,join } from 'node:path'
import { z } from 'zod'
import { enableConfigs } from '../src/utils/config.js'
import { getGlobalClaudeFile } from '../src/utils/env.js'
import { getActiveProviderProfile,getProviderProfiles } from '../src/utils/providerProfiles.js'
import { testerEndpoint,HOSTED_TESTER_PROFILE } from '../src/services/hostedTesterAccess.js'
import { createOpenAIShimClient } from '../src/services/api/openaiShim.js'

const root=process.env.OPENCLAUDE_CONFIG_DIR,journal=process.env.AMIRAHCO_PROMPT_JOURNAL
assert(root&&journal&&!relative(resolve(root),resolve(getGlobalClaudeFile())).startsWith('..'),'Isolated native store and journal required')
enableConfigs()
const profile=getActiveProviderProfile()
assert(profile?.name===HOSTED_TESTER_PROFILE&&profile.apiKey&&/^sk-tp-[a-f0-9]{48}$/.test(profile.apiKey),'Approved saved tester profile required')
assert(profile.baseUrl===testerEndpoint()&&profile.model==='auto:amirahco-partners','Exact hosted route required')
assert(getProviderProfiles().length===2,'Existing provider must remain present')
const initial=z.object({keyDigest:z.string(),profileId:z.string()}).parse(JSON.parse(readFileSync(join(root,'..','approved-save-receipt.json'),'utf8')))
assert(createHash('sha256').update(profile.apiKey).digest('hex')===initial.keyDigest&&profile.id===initial.profileId,'Original saved identity differs')
Object.assign(process.env,{CLAUDE_CODE_USE_OPENAI:'1',OPENAI_BASE_URL:profile.baseUrl,OPENAI_API_KEY:profile.apiKey,OPENAI_MODEL:profile.model,OPENAI_API_FORMAT:'chat_completions'})
const client=createOpenAIShimClient({maxRetries:0,providerOverride:{baseURL:profile.baseUrl,model:profile.model,apiKey:profile.apiKey}})
assert(client&&typeof client==='object'&&'beta'in client)
const beta=client.beta;assert(beta&&typeof beta==='object'&&'messages'in beta)
const messages=beta.messages;assert(messages&&typeof messages==='object'&&'create'in messages&&typeof messages.create==='function')
if(process.argv[2]==='validate-only'){console.log('Compiled native shim and original approved profile ready; no network request');process.exit(0)}
assert(process.argv[2]==='send-once','Use validate-only or explicit send-once')
const append=(value:unknown,first=false)=>{const fd=openSync(journal,first?'ax':'a',0o600);try{writeSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd)}finally{closeSync(fd)}}
append({state:'intent_reserved',prompt:'Reply exactly READY.',maxOutputTokens:16,automaticReplay:false,runtime:process.version,profileId:profile.id},true)
const nativeFetch=globalThis.fetch
let wireAttempts=0
const wireBody=z.object({model:z.literal('auto:amirahco-partners'),max_tokens:z.literal(16),stream:z.literal(false)}).passthrough()
globalThis.fetch=Object.assign(async(input:RequestInfo|URL,init?:RequestInit)=>{
 assert(String(input)===testerEndpoint()+'/chat/completions'&&init?.method==='POST','Unexpected native network request')
 assert(++wireAttempts===1,'No second wire attempt is permitted')
 const headers=new Headers(init.headers),actionId=headers.get('idempotency-key'),body=String(init.body)
 assert(actionId&&/^amirahco-[a-f0-9]{64}$/.test(actionId),'Native original action identity required')
 wireBody.parse(JSON.parse(body))
 append({state:'wire_reserved',actionId,body,bodyBytes:Buffer.byteLength(body),bodyDigest:createHash('sha256').update(body).digest('hex'),wireAttempts})
 const response=await nativeFetch(input,{...init,redirect:'error',signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(60000)])})
 const observed=await response.clone().json().catch(()=>null)
 const parsed=z.object({model:z.string(),choices:z.array(z.object({message:z.object({content:z.string().nullable()})})),usage:z.object({prompt_tokens:z.number(),completion_tokens:z.number(),total_tokens:z.number()})}).safeParse(observed)
 append({state:'http_observed',httpStatus:response.status,...(parsed.success?{providerModel:parsed.data.model,text:parsed.data.choices.map(c=>c.message.content??'').join(''),providerUsage:parsed.data.usage}:{}),wireAttempts})
 return response
},{preconnect:()=>{}})
try{
 const result=await Reflect.apply(messages.create,messages,[{model:profile.model,max_tokens:16,stream:false,messages:[{role:'user',content:'Reply exactly READY.'}]},{signal:AbortSignal.timeout(65000)}])
 const parsed=z.object({content:z.array(z.object({type:z.string(),text:z.string().optional()}).passthrough())}).parse(result)
 const text=parsed.content.filter(c=>c.type==='text').map(c=>c.text??'').join('')
 append({state:'completed',text,readyReply:text.trim()==='READY',wireAttempts,nativeConversion:true})
 assert(text.trim()==='READY','Observed reply did not match the requested answer')
 console.log('Actual native shim reply: '+text+'; wire attempts: '+wireAttempts)
}catch(error){append({state:'held_inspect_original_action',errorClass:error instanceof Error?error.name:'unknown',wireAttempts});console.error('Native prompt held; inspect the original receipt and router action, never automatically replay.');process.exitCode=1}
finally{globalThis.fetch=nativeFetch}
