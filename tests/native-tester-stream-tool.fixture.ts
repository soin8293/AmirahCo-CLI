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

const root=process.env.OPENCLAUDE_CONFIG_DIR,journal=process.env.AMIRAHCO_STREAM_TOOL_JOURNAL
assert(root&&journal&&!relative(resolve(root),resolve(getGlobalClaudeFile())).startsWith('..'),'Isolated store and journal required')
enableConfigs()
const profile=getActiveProviderProfile()
assert(profile?.name===HOSTED_TESTER_PROFILE&&profile.apiKey&&/^sk-tp-[a-f0-9]{48}$/.test(profile.apiKey))
assert(profile.baseUrl===testerEndpoint()&&profile.model==='auto:amirahco-partners'&&getProviderProfiles().length===2)
const initial=z.object({keyDigest:z.string(),profileId:z.string()}).parse(JSON.parse(readFileSync(join(root,'..','approved-save-receipt.json'),'utf8')))
assert(createHash('sha256').update(profile.apiKey).digest('hex')===initial.keyDigest&&profile.id===initial.profileId)
Object.assign(process.env,{CLAUDE_CODE_USE_OPENAI:'1',OPENAI_BASE_URL:profile.baseUrl,OPENAI_API_KEY:profile.apiKey,OPENAI_MODEL:profile.model,OPENAI_API_FORMAT:'chat_completions'})
const client=createOpenAIShimClient({maxRetries:0,providerOverride:{baseURL:profile.baseUrl,model:profile.model,apiKey:profile.apiKey}})
assert(client&&typeof client==='object'&&'beta'in client)
const beta=client.beta;assert(beta&&typeof beta==='object'&&'messages'in beta)
const messages=beta.messages;assert(messages&&typeof messages==='object'&&'create'in messages&&typeof messages.create==='function')
if(process.argv[2]==='validate-only'){console.log('Native streaming adapter and original saved tester profile ready; no network request');process.exit(0)}
const single=process.argv[2]==='send-one-tool-once'
assert(single||process.argv[2]==='send-two-once','Use validate-only or explicit bounded send mode')
const append=(value:unknown,first=false)=>{const fd=openSync(journal,first?'ax':'a',0o600);try{writeSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd)}finally{closeSync(fd)}}
append({state:'intent_reserved',requestLimit:single?1:2,maxOutputTokens:64,tool:'add',arguments:{a:2,b:3},automaticReplay:false,runtime:process.version,profileId:profile.id},true)
const nativeFetch=globalThis.fetch,attempts=[0,0]
let turn=0
const usageSchema=z.object({prompt_tokens:z.number(),completion_tokens:z.number(),total_tokens:z.number()})
globalThis.fetch=Object.assign(async(input:RequestInfo|URL,init?:RequestInit)=>{
 const current=turn;assert(current===1||current===2)
 assert(String(input)===testerEndpoint()+'/chat/completions'&&init?.method==='POST')
 assert(++attempts[current-1]===1,'A second wire attempt in the same turn is forbidden')
 const headers=new Headers(init.headers),actionId=headers.get('idempotency-key'),body=String(init.body)
 assert(actionId&&/^amirahco-[a-f0-9]{64}$/.test(actionId))
 z.object({model:z.literal('auto:amirahco-partners'),max_tokens:z.literal(64),stream:z.literal(true),stream_options:z.object({include_usage:z.literal(true)})}).passthrough().parse(JSON.parse(body))
 append({state:'wire_reserved',turn:current,actionId,body,bodyBytes:Buffer.byteLength(body),bodyDigest:createHash('sha256').update(body).digest('hex')})
 const response=await nativeFetch(input,{...init,redirect:'error',signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(60000)])})
 append({state:'http_observed',turn:current,httpStatus:response.status,contentType:response.headers.get('content-type')})
 if(!response.ok||!response.body)return response
 assert(response.headers.get('content-type')?.includes('text/event-stream'),'Expected real SSE response')
 const decoder=new TextDecoder();let tail='',frames=0,toolArgumentChunks=0,model:string|undefined,usage:z.infer<typeof usageSchema>|undefined,terminal=false
 const stream=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
  transform(chunk,controller){
   tail+=decoder.decode(chunk,{stream:true});const complete=tail.split(/\r?\n\r?\n/);tail=complete.pop()??'';assert(tail.length<65536)
   for(const frame of complete){
    const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');if(!data)continue
    frames++
    if(data==='[DONE]'){terminal=true;append({state:'sse_terminal',turn:current,frames,toolArgumentChunks,providerModel:model,providerUsage:usage});continue}
    const event=z.object({model:z.string().optional(),usage:z.unknown().optional(),choices:z.array(z.object({delta:z.object({tool_calls:z.array(z.object({function:z.object({arguments:z.string().optional()}).optional()}).passthrough()).optional()}).passthrough().optional()}).passthrough()).optional()}).passthrough().parse(JSON.parse(data))
    if(event.model)model=event.model
    const parsed=usageSchema.safeParse(event.usage);if(parsed.success)usage=parsed.data
    for(const choice of event.choices??[])for(const call of choice.delta?.tool_calls??[])if(call.function?.arguments)toolArgumentChunks++
   }
   controller.enqueue(chunk)
  },
  flush(){append({state:'sse_eof',turn:current,terminal,frames})},
 }))
 const wrapped=new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers})
 Object.defineProperty(wrapped,'url',{value:response.url})
 return wrapped
},{preconnect:()=>{}})

const eventSchema=z.object({type:z.string(),index:z.number().optional(),content_block:z.object({type:z.string(),id:z.string().optional(),name:z.string().optional(),input:z.unknown().optional()}).passthrough().optional(),delta:z.object({type:z.string().optional(),partial_json:z.string().optional(),text:z.string().optional(),stop_reason:z.string().nullable().optional()}).passthrough().optional()}).passthrough()
const iterableSchema=z.custom<AsyncIterable<unknown>>(value=>value!==null&&typeof value==='object'&&Symbol.asyncIterator in value&&typeof value[Symbol.asyncIterator]==='function')
const tool={name:'add',description:'Add two integers.',input_schema:{type:'object',properties:{a:{type:'integer'},b:{type:'integer'}},required:['a','b'],additionalProperties:false}}
const prompt={role:'user',content:single?'Call add exactly once with a=2 and b=3. Return the tool call only.':'Use add to calculate 2 plus 3. After the result, reply only 5.'}
async function consume(params:Record<string,unknown>){
 const stream=iterableSchema.parse(await Reflect.apply(messages.create,messages,[params,{signal:AbortSignal.timeout(65000)}]))
 const calls=new Map<number,{id:string;name:string;input:unknown;json:string}>();let text='',stopped=false,events=0,reason:string|null|undefined
 for await(const value of stream){
  const event=eventSchema.parse(value);events++;append({state:'native_event',turn,event})
  if(event.type==='content_block_start'&&event.content_block?.type==='tool_use'){
   assert(event.index!==undefined&&event.content_block.id&&event.content_block.name)
   calls.set(event.index,{id:event.content_block.id,name:event.content_block.name,input:event.content_block.input,json:''})
  }
  if(event.delta?.type==='input_json_delta'){
   assert(event.index!==undefined);const call=calls.get(event.index);assert(call);call.json+=event.delta.partial_json??''
  }
  if(event.delta?.type==='text_delta')text+=event.delta.text??''
  if(event.delta?.stop_reason)reason=event.delta.stop_reason
  if(event.type==='message_stop')stopped=true
 }
 assert(stopped,'Native stream did not reach message_stop')
 append({state:'native_turn_completed',turn,text,eventCount:events,toolCalls:calls.size,stopReason:reason})
 return {calls,text}
}
try{
 turn=1
 const first=await consume({model:profile.model,max_tokens:64,stream:true,messages:[prompt],tools:[tool],tool_choice:{type:'tool',name:'add'}})
 assert(first.calls.size===1,'Exactly one real model tool call required')
 const call=[...first.calls.values()][0];assert(call&&call.name==='add')
 const args=z.object({a:z.literal(2),b:z.literal(3)}).strict().parse(call.json?JSON.parse(call.json):call.input)
 const result=args.a+args.b;assert(result===5)
 append({state:'tool_executed',tool:call.name,toolCallId:call.id,arguments:args,result,effects:'pure fixture calculation only'})
 if(single){
  append({state:'completed_tool_call_only',streamingTurns:1,toolResult:result,resultSubmittedBackToModel:false,wireAttempts:attempts})
  console.log('Real streamed add(2, 3) tool call validated and executed: 5. Model continuation remains untested.')
 }else{
 turn=2
 const second=await consume({model:profile.model,max_tokens:64,stream:true,messages:[prompt,{role:'assistant',content:[{type:'tool_use',id:call.id,name:call.name,input:args}]},{role:'user',content:[{type:'tool_result',tool_use_id:call.id,content:String(result)}]}],tools:[tool],tool_choice:{type:'none'}})
 assert(second.calls.size===0&&second.text.trim()==='5','Streamed final answer did not match the performed tool result')
 append({state:'completed',toolRoundTrip:true,streamingTurns:2,reply:second.text,wireAttempts:attempts})
 console.log('Real streamed tool round trip: add(2, 3) = 5; final reply: '+second.text+'; one wire attempt per turn.')
 }
}catch(error){append({state:'held_inspect_original_actions',turn,errorClass:error instanceof Error?error.name:'unknown',wireAttempts:attempts});console.error('Streaming/tool test held; inspect original actions, never automatically replay.');process.exitCode=1}
finally{globalThis.fetch=nativeFetch}
