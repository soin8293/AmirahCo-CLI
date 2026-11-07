import { afterEach, beforeEach, expect, test } from 'bun:test'
import { createOpenAIShimClient } from './openaiShim.js'
import { isOpenAIRequestNonReplayable } from './openaiErrorClassification.js'
import { acquireSharedMutationLock, releaseSharedMutationLock } from '../../test/sharedMutationLock.js'

const originalFetch=globalThis.fetch
const fields=['CLAUDE_CODE_USE_OPENAI','OPENAI_BASE_URL','OPENAI_API_KEY','OPENAI_MODEL','OPENAI_API_FORMAT'] as const
let original:Record<string,string|undefined>={}
const key='sk-tp-'+'a'.repeat(48)
beforeEach(async()=>{
  await acquireSharedMutationLock('hosted-tester-wire')
  original=Object.fromEntries(fields.map(name=>[name,process.env[name]]))
  Object.assign(process.env,{CLAUDE_CODE_USE_OPENAI:'1',OPENAI_BASE_URL:'https://testers.example/v1',
    OPENAI_API_KEY:key,OPENAI_MODEL:'auto:amirahco-partners',OPENAI_API_FORMAT:'chat_completions'})
})
afterEach(()=>{
  globalThis.fetch=originalFetch
  for(const name of fields) {if(original[name]===undefined)delete process.env[name];else process.env[name]=original[name]}
  releaseSharedMutationLock()
})
type Client={beta:{messages:{create(params:Record<string,unknown>,options?:{signal:AbortSignal}):Promise<unknown>}}}
function client(){return createOpenAIShimClient({providerOverride:{baseURL:'https://testers.example/v1',model:'auto:amirahco-partners',apiKey:key}}) as Client}
const params={model:'auto:amirahco-partners',max_tokens:32000,stream:false,messages:[{role:'user',content:'Reply READY.'}]}
function fakeFetch(work:(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>){
  globalThis.fetch=Object.assign(work,{preconnect:()=>{}}) as typeof fetch
}
test('the actual native shim sends a bounded original tester identity and converts the response',async()=>{
  const seen:RequestInit[]=[]
  fakeFetch(async(_input,init)=>{seen.push(init??{});return Response.json({id:'fixture',object:'chat.completion',model:'qwen38',
    choices:[{index:0,message:{role:'assistant',content:'READY'},finish_reason:'stop'}],
    usage:{prompt_tokens:4,completion_tokens:2,total_tokens:6}})})
  const result=await client().beta.messages.create(params)
  expect(seen).toHaveLength(1)
  expect(new Headers(seen[0]!.headers).get('idempotency-key')).toMatch(/^amirahco-[a-f0-9]{64}$/)
  expect(JSON.parse(String(seen[0]!.body)).max_tokens).toBe(8192)
  expect(JSON.stringify(result)).toContain('READY')
})
test.each(['network','quota'] as const)('native %s failure cannot cause a second wire attempt',async failure=>{
  let calls=0
  fakeFetch(async()=>{calls++;if(failure==='network')throw new TypeError('fetch failed')
    return Response.json({error:{message:'Tester allowance exhausted',code:'tester_allowance_exhausted'}},{status:429})})
  let caught:unknown
  try{await client().beta.messages.create(params)}catch(error){caught=error}
  expect(calls).toBe(1);expect(caught).toBeDefined();expect(isOpenAIRequestNonReplayable(caught)).toBe(true)
})
