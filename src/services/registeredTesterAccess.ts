import { z } from 'zod'
import { testerEndpoint,connectTesterAccess } from './hostedTesterAccess.js'
import { testerFirebaseConfigSchema } from './testerFirebaseConfig.js'
import { signInTesterGoogle } from './testerGoogleSignIn.js'

const accountSchema=z.object({status:z.enum(['not_requested','pending','approved','revoked']),uid:z.string(),email:z.string().email()})
const credentialSchema=z.object({key:z.string().regex(/^sk-tp-[a-f0-9]{48}$/),model:z.literal('auto:amirahco-partners')})
type Dependencies={fetch:(url:string,init:RequestInit)=>Promise<Response>;signIn:typeof signInTesterGoogle;connect:typeof connectTesterAccess}
const defaults:Dependencies={fetch:(url,init)=>globalThis.fetch(url,init),signIn:signInTesterGoogle,connect:connectTesterAccess}
export async function connectRegisteredTester(options:{signal:AbortSignal;onBrowserUrl?:(url:string)=>void;endpoint?:string},dependencies:Dependencies=defaults):Promise<'pending'|'revoked'|'connected'>{
  const endpoint=testerEndpoint(options.endpoint)
  const request=async(path:string,method:'GET'|'POST',token?:string,body?:unknown)=>{
    options.signal.throwIfAborted()
    let response:Response
    try{response=await dependencies.fetch(endpoint+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.any([options.signal,AbortSignal.timeout(15000)]),redirect:'error',cache:'no-store'})}
    catch{throw new Error(options.signal.aborted?'Account setup cancelled.':'Could not reach tester accounts. Your existing setup is unchanged.')}
    if(!response.ok)throw new Error(response.status===401?'Sign in with Google again to check your access.':response.status===403?'Tester access is not approved or is no longer active.':'Account setup could not finish. Check your access before trying again.')
    try{return await response.json() as unknown}catch{throw new Error('Tester accounts returned an unexpected response. Your existing setup is unchanged.')}
  }
  const config=testerFirebaseConfigSchema.safeParse(await request('/tester-account/config','GET'))
  if(!config.success)throw new Error('Google sign-in setup is unavailable. Try again later.')
  const token=await dependencies.signIn({config:config.data,signal:options.signal,onUrl:options.onBrowserUrl})
  const parseAccount=(value:unknown)=>{const parsed=accountSchema.safeParse(value);if(!parsed.success)throw new Error('Your account status could not be read. Try again later.');return parsed.data}
  let account=parseAccount(await request('/tester-account','GET',token))
  if(account.status==='not_requested')account=parseAccount(await request('/tester-account','POST',token,{consent:'partner-pilot-v1'}))
  options.signal.throwIfAborted()
  if(account.status==='pending'||account.status==='revoked')return account.status
  if(account.status!=='approved')throw new Error('Your tester request could not finish. Check your access again.')
  const credential=credentialSchema.safeParse(await request('/tester-account/credential','POST',token,{}))
  if(!credential.success)throw new Error('Your approved access could not be connected. Contact AmirahCo.')
  options.signal.throwIfAborted()
  await dependencies.connect(credential.data.key,{signal:options.signal,endpoint})
  return 'connected'
}
