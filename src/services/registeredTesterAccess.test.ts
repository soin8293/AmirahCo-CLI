import { expect,test } from 'bun:test'
import { connectRegisteredTester } from './registeredTesterAccess.js'
const endpoint='https://testers.example/v1',key='sk-tp-'+'a'.repeat(48)
const config={projectId:'amirahcous',appId:'1:682616290623:web:85e21b3eb80da1ae39278a',authDomain:'amirahcous.firebaseapp.com',apiKey:'AIza'+'f'.repeat(35)}
function fixture(status:'not_requested'|'pending'|'approved'|'revoked'){
  const calls:{path:string;init:RequestInit}[]=[],saved:string[]=[]
  const deps={fetch:async(url:string,init:RequestInit)=>{
    const path=url.slice(endpoint.length);calls.push({path,init})
    const data=path.endsWith('/config')?config:path.endsWith('/credential')?{key,model:'auto:amirahco-partners'}:
      {status:init.method==='POST'?'pending':status,uid:'firebase_fixture',email:'fixture@example.test'}
    return Response.json(data)
  },signIn:async()=> 'fixture.identity.signature',connect:async(value:string)=>{saved.push(value)}}
  return {calls,saved,deps}
}
test('first verified sign-in requests access and remains pending without a key or work',async()=>{
  const f=fixture('not_requested')
  expect(await connectRegisteredTester({endpoint,signal:new AbortController().signal},f.deps)).toBe('pending')
  expect(f.calls.map(c=>c.path)).toEqual(['/tester-account/config','/tester-account','/tester-account'])
  expect(JSON.parse(String(f.calls[2]?.init.body))).toEqual({consent:'partner-pilot-v1'})
  expect(f.saved).toEqual([])
})
test.each(['pending','revoked'] as const)('%s users cannot retrieve or save a credential',async status=>{
  const f=fixture(status);expect(await connectRegisteredTester({endpoint,signal:new AbortController().signal},f.deps)).toBe(status)
  expect(f.calls).toHaveLength(2);expect(f.saved).toEqual([])
})
test('approved access uses the existing native verification and save path with no registration replay',async()=>{
  const f=fixture('approved');expect(await connectRegisteredTester({endpoint,signal:new AbortController().signal},f.deps)).toBe('connected')
  expect(f.calls.map(c=>c.path)).toEqual(['/tester-account/config','/tester-account','/tester-account/credential'])
  expect(f.saved).toEqual([key]);expect(f.calls.every(c=>c.init.redirect==='error')).toBe(true)
})
test('a lost reply is not automatically retried and cannot leak token or key errors',async()=>{
  const f=fixture('approved');f.deps.fetch=async()=>{throw Error('transport '+key+' fixture.identity.signature')}
  await expect(connectRegisteredTester({endpoint,signal:new AbortController().signal},f.deps)).rejects.toThrow('Could not reach')
  expect(f.saved).toEqual([])
})
test('Stop after sign-in fences subsequent account calls and profile mutation',async()=>{
  const f=fixture('approved'),controller=new AbortController();f.deps.signIn=async()=>{controller.abort();return 'fixture.identity.signature'}
  await expect(connectRegisteredTester({endpoint,signal:controller.signal},f.deps)).rejects.toThrow()
  expect(f.calls).toHaveLength(1);expect(f.saved).toEqual([])
})
