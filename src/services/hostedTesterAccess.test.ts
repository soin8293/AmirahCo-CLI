import { describe, expect, test } from 'bun:test'
import { connectTesterAccess, testerEndpoint, HOSTED_TESTER_PROFILE } from './hostedTesterAccess.js'
import { HOSTED_TESTER_MODEL } from '../constants/hostedTesterEndpoint.js'
import { isTesterWireRequest, prepareTesterWireRequest } from './api/hostedTesterWire.js'
import type { ProviderProfile } from '../utils/config.js'

const key = 'sk-tp-' + 'a'.repeat(48)
const endpoint = 'https://testers.example/v1'
function fixture(status = 200, data: unknown = {data: [{id:HOSTED_TESTER_MODEL}]}) {
  let added = 0, updated = 0, activated = 0
  let profiles: ProviderProfile[] = []
  let active: ProviderProfile | undefined
  let observed: {url:string;init:RequestInit} | undefined
  const deps = {
    fetch: async (url:string,init:RequestInit) => {observed={url,init};return Response.json(data,{status})},
    readProfiles: () => profiles,
    add: (input:Record<string,unknown>) => {added++; const saved={id:'tester-id',...input} as ProviderProfile; profiles.push(saved);active=saved;return saved},
    update: (id:string,input:Record<string,unknown>) => {updated++;const saved={id,...input} as ProviderProfile;profiles=profiles.map(profile=>profile.id===id?saved:profile);active=undefined;return saved},
    active: () => active,
    activate: () => {activated++;active=profiles.find(profile=>profile.id==='tester-id');return active??null},
  }
  return {deps:deps as unknown as NonNullable<Parameters<typeof connectTesterAccess>[2]>,
    counts:()=>({added,updated,activated}), observed:()=>observed}
}
describe('native tester key onboarding', () => {
  test('requires configured HTTPS without credentials/query or an installer Quick Tunnel', () => {
    for(const value of ['http://testers.example/v1','https://user:secret@testers.example/v1',
      'https://testers.example/v1?key=secret','https://abc.trycloudflare.com/v1','https://testers.example/api']) {
      expect(()=>testerEndpoint(value)).toThrow()
    }
    expect(testerEndpoint(endpoint+'/')).toBe(endpoint)
  })
  test('only verifies models, preserves cancellation and saves the exact native profile', async () => {
    const f=fixture(),controller=new AbortController()
    await connectTesterAccess(key,{endpoint,signal:controller.signal},f.deps)
    expect(f.counts()).toEqual({added:1,updated:0,activated:0})
    expect(f.observed()?.url).toBe(endpoint+'/models')
    expect(f.observed()?.init.method).toBe('GET')
    expect(f.observed()?.init.redirect).toBe('error')
    expect(f.observed()?.init.body).toBeUndefined()
  })
  test('reconciles a saved profile instead of duplicating it on repeat setup', async () => {
    const f=fixture()
    for(let i=0;i<2;i++)await connectTesterAccess(key,{endpoint,signal:new AbortController().signal},f.deps)
    expect(f.counts()).toEqual({added:1,updated:1,activated:1})
  })
  test('denies invalid, revoked, unavailable and wrong-scope keys before saving', async () => {
    for(const status of [401,403,429,503]) {
      const f=fixture(status)
      await expect(connectTesterAccess(key,{endpoint,signal:new AbortController().signal},f.deps)).rejects.toThrow()
      expect(f.counts().added).toBe(0)
    }
    const f=fixture(200,{data:[{id:'auto'}]})
    await expect(connectTesterAccess(key,{endpoint,signal:new AbortController().signal},f.deps)).rejects.toThrow('does not include')
    expect(f.counts().added).toBe(0)
  })
  test('reuses a committed profile after its first save reply is lost', async () => {
    const f=fixture(),add=f.deps.add
    f.deps.add=(...args)=>{add(...args);throw new Error('save reply lost')}
    const options={endpoint,signal:new AbortController().signal}
    await expect(connectTesterAccess(key,options,f.deps)).rejects.toThrow('Check your saved connection')
    await connectTesterAccess(key,options,f.deps)
    expect(f.counts()).toEqual({added:1,updated:1,activated:1})
  })
  test('a missing saved profile during activation cannot report connected', async () => {
    const f=fixture(),options={endpoint,signal:new AbortController().signal}
    await connectTesterAccess(key,options,f.deps)
    f.deps.activate=()=>null
    await expect(connectTesterAccess(key,options,f.deps)).rejects.toThrow('Check your saved connection')
    expect(f.counts().added).toBe(1)
  })
  test('a native save refusal cannot report connected from the returned profile alone', async () => {
    const f=fixture()
    f.deps.add=input=>({id:'unsaved',...input} as ProviderProfile)
    await expect(connectTesterAccess(key,{endpoint,signal:new AbortController().signal},f.deps)).rejects.toThrow('Check your saved connection')
    expect(f.deps.active()).toBeUndefined()
  })
  test('cancellation after verification cannot save or switch providers', async () => {
    const f=fixture(),controller=new AbortController(),fetch=f.deps.fetch
    f.deps.fetch=async(...args)=>{const response=await fetch(...args);controller.abort();return response}
    await expect(connectTesterAccess(key,{endpoint,signal:controller.signal},f.deps)).rejects.toThrow('cancelled')
    expect(f.counts()).toEqual({added:0,updated:0,activated:0})
  })
  test('does not expose credential values from transport or save failures', async () => {
    for(const operation of ['fetch','add'] as const) {
      const f=fixture(); f.deps[operation]=()=>{throw new Error('failure '+key)}
      try {await connectTesterAccess(key,{endpoint,signal:new AbortController().signal},f.deps);throw new Error('expected failure')}
      catch(error){expect(String(error)).not.toContain(key)}
    }
  })
})
describe('native tester request identity', () => {
  const init={method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify({model:HOSTED_TESTER_MODEL,max_tokens:32000,messages:[{role:'user',content:'hello'}]})}
  test('binds one stable identity across retries/reopen, clamps output and preserves Stop', () => {
    const signal=new AbortController().signal
    const a=prepareTesterWireRequest(endpoint+'/chat/completions',{...init,signal},'native-session')
    const b=prepareTesterWireRequest(endpoint+'/chat/completions',{...init,signal},'native-session')
    expect(new Headers(a.headers).get('idempotency-key')).toBe(new Headers(b.headers).get('idempotency-key'))
    expect(JSON.parse(String(a.body)).max_tokens).toBe(8192)
    expect(a.signal).toBe(signal);expect(a.redirect).toBe('error')
    expect(new Headers(a.headers).get('idempotency-key')).not.toContain(key)
    const other=prepareTesterWireRequest(endpoint+'/chat/completions',init,'another-session')
    expect(new Headers(other.headers).get('idempotency-key')).not.toBe(new Headers(a.headers).get('idempotency-key'))
  })
  test('leaves existing providers byte-identical and rejects scoped model/route escape', () => {
    const original={...init,headers:{Authorization:'Bearer existing-provider-key'}}
    expect(isTesterWireRequest(original)).toBe(false)
    expect(prepareTesterWireRequest(endpoint+'/chat/completions',original,'session')).toBe(original)
    expect(()=>prepareTesterWireRequest(endpoint+'/chat/completions',{...init,body:'{"model":"auto"}'},'session')).toThrow()
    expect(()=>prepareTesterWireRequest(endpoint+'/embeddings',init,'session')).toThrow()
    expect(()=>prepareTesterWireRequest('http://testers.example/v1/chat/completions',init,'session')).toThrow()
  })
})
