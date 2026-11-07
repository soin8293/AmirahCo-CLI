import { expect,test } from 'bun:test'
import { request } from 'node:http'
import { signInTesterGoogle } from './testerGoogleSignIn.js'
const config={projectId:'amirahcous' as const,appId:'1:682616290623:web:85e21b3eb80da1ae39278a' as const,authDomain:'amirahcous.firebaseapp.com' as const,apiKey:'AIza'+'f'.repeat(35)}
function call(url:URL,path:string,headers:Record<string,string>,body?:string){
  return new Promise<{status:number;body:string;headers:Record<string,unknown>}>((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port:url.port,path,method:body===undefined?'GET':'POST',headers:{Host:url.host,...headers}},res=>{
      let data='';res.on('data',chunk=>{data+=chunk});res.on('end',()=>resolve({status:res.statusCode??0,body:data,headers:res.headers}))
    });req.on('error',reject);req.end(body)
  })
}
test('same-origin POST callback binds state; query token, wrong Host/Origin, malformed and oversized bodies cannot complete sign-in',async()=>{
  let ready:(url:string)=>void=()=>{};const opened=new Promise<string>(resolve=>{ready=resolve})
  const controller=new AbortController()
  const pending=signInTesterGoogle({config,signal:controller.signal,clientSource:'// fixture',openUrl:async url=>{ready(url);return true}})
  try{
    const url=new URL(await opened),state=url.pathname.split('/').pop()!,headers={'Content-Type':'application/json',Origin:url.origin}
    const page=await call(url,url.pathname,{})
    expect(page.body).toContain('Continue with Google');expect(page.headers['cache-control']).toBe('no-store')
    expect((await call(url,'/callback?token=secret',headers,JSON.stringify({state,token:'fixture'}))).status).toBe(404)
    expect((await call(url,'/callback',{...headers,Host:'attacker.test'},JSON.stringify({state,token:'fixture'}))).status).toBe(403)
    expect((await call(url,'/callback',{...headers,Origin:'https://attacker.test'},JSON.stringify({state,token:'fixture'}))).status).toBe(403)
    expect((await call(url,'/callback',headers,JSON.stringify({state:'0'.repeat(64),token:'fixture'}))).status).toBe(400)
    expect((await call(url,'/callback',headers,'x'.repeat(17000))).status).toBe(413)
    expect((await call(url,'/callback',headers,JSON.stringify({state,token:'fixture-id-token'}))).status).toBe(200)
    expect(await pending).toBe('fixture-id-token')
  }finally{controller.abort();await pending.catch(()=>{})}
})
test('Stop closes the callback listener and rejects a late sign-in',async()=>{
  let ready:(url:string)=>void=()=>{};const opened=new Promise<string>(resolve=>{ready=resolve}),controller=new AbortController()
  const pending=signInTesterGoogle({config,signal:controller.signal,clientSource:'// fixture',openUrl:async url=>{ready(url);return true}})
  const url=new URL(await opened);controller.abort()
  await expect(pending).rejects.toThrow('cancelled')
  await expect(call(url,url.pathname,{})).rejects.toThrow()
})
test('a bounded sign-in timeout cannot leave a live callback server',async()=>{
  await expect(signInTesterGoogle({config,signal:new AbortController().signal,clientSource:'// fixture',timeoutMs:20,openUrl:async()=>true})).rejects.toThrow('timed out')
})
