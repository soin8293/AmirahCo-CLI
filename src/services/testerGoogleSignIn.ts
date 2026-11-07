import { createServer } from 'node:http'
import { randomBytes,timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { openBrowser } from '../utils/browser.js'
import { testerFirebaseConfigSchema } from './testerFirebaseConfig.js'

declare const TESTER_GOOGLE_CLIENT_SOURCE:string

type SignInOptions={signal:AbortSignal;config:z.infer<typeof testerFirebaseConfigSchema>;onUrl?:(url:string)=>void;
  openUrl?:(url:string)=>Promise<boolean>;clientSource?:string;timeoutMs?:number}

export async function signInTesterGoogle(options:SignInOptions):Promise<string>{
  const config=testerFirebaseConfigSchema.parse(options.config)
  const script=options.clientSource??(typeof TESTER_GOOGLE_CLIENT_SOURCE==='string'?TESTER_GOOGLE_CLIENT_SOURCE:undefined)
  if(!script)throw new Error('Google sign-in is unavailable in this build.')
  options.signal.throwIfAborted()
  const state=randomBytes(32).toString('hex'),signal=AbortSignal.any([options.signal,AbortSignal.timeout(options.timeoutMs??180000)])
  let resolveToken:(token:string)=>void=()=>{},rejectToken:(error:Error)=>void=()=>{}
  const result=new Promise<string>((resolve,reject)=>{resolveToken=resolve;rejectToken=reject})
  void result.catch(()=>{})
  let origin='',settled=false
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer')
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY')
    res.setHeader('Cross-Origin-Opener-Policy','same-origin-allow-popups')
    res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self' https://apis.google.com; style-src 'nonce-${state}'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; frame-src https://amirahcous.firebaseapp.com https://accounts.google.com; base-uri 'none'; form-action 'none'`)
    const send=(status:number,body:string,type='text/plain; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(body)}
    try{
      if(req.headers.host!==new URL(origin).host || req.headers.origin && req.headers.origin!==origin){send(403,'Request denied');return}
      if(req.method==='GET'&&req.url==='/login/'+state){
        send(200,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="amirahco-state" content="${state}"><title>AmirahCo CLI sign-in</title><style nonce="${state}">body{font:18px system-ui;max-width:38rem;margin:12vh auto;padding:24px;background:#022c22;color:#ecfdf5}button{font:inherit;padding:12px 18px;background:#10b981;color:#022c22;border:0;border-radius:8px;cursor:pointer}p{line-height:1.5}button:disabled{opacity:.6}</style></head><body><h1>Sign in to AmirahCo CLI</h1><p>Use your Google account to request tester access. AmirahCo must approve your access before you can use the partner pool.</p><p>Partner access may send your prompts and relevant project files to Heabsy or Inferbase. Access has a limited allowance.</p><button id="google" disabled>Continue with Google</button><button id="redirect" hidden>Continue in this tab</button><p id="status" role="status">Preparing Google sign-in…</p><script type="module" src="/client.js"></script></body></html>`,'text/html; charset=utf-8');return
      }
      if(req.method==='GET'&&req.url==='/client.js'){send(200,script,'text/javascript; charset=utf-8');return}
      if(req.method==='GET'&&req.url==='/config'){send(200,JSON.stringify(config),'application/json');return}
      if(req.method!=='POST'||req.url!=='/callback'){send(404,'Not found');return}
      if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json')){send(403,'Request denied');return}
      let body=''
      for await(const chunk of req){body+=String(chunk);if(Buffer.byteLength(body)>16384){send(413,'Request too large');return}}
      const parsed=z.object({state:z.string().regex(/^[a-f0-9]{64}$/),token:z.string().min(1).max(8192)}).strict().safeParse(JSON.parse(body))
      if(!parsed.success||!timingSafeEqual(Buffer.from(parsed.data.state),Buffer.from(state))||settled||signal.aborted){send(400,'Sign-in was not accepted');return}
      settled=true;send(200,'Received');resolveToken(parsed.data.token)
    }catch{if(!res.headersSent)send(400,'Sign-in was not accepted');else res.end()}
  })
  const abort=()=>rejectToken(new Error(options.signal.aborted?'Google sign-in cancelled.':'Google sign-in timed out. Try again.'))
  signal.addEventListener('abort',abort,{once:true})
  try{
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
    const address=server.address();if(!address||typeof address==='string')throw new Error('Google sign-in could not open.')
    origin='http://localhost:'+address.port
    const url=origin+'/login/'+state;options.onUrl?.(url)
    if(signal.aborted)abort()
    else await (options.openUrl??openBrowser)(url)
    return await result
  }finally{signal.removeEventListener('abort',abort);if(signal.aborted)server.closeAllConnections();server.close()}
}
