import {spawn} from 'node:child_process'
import {EventEmitter} from 'node:events'
import {createRequire} from 'node:module'
import {Worker} from 'node:worker_threads'

type Data={root:string;fault?:string}
export interface StorageWorker {
  on(event:string,listener:(...args:any[])=>void):unknown
  postMessage(message:unknown):void
  ref():unknown
  unref():unknown
  terminate():Promise<number>
}

export function createStorageWorker(source:string,windowsSource:string,data:Data):StorageWorker {
  if(process.platform!=='win32')return new Worker(source,{eval:true,execArgv:[],workerData:data})
  const koffiPath=createRequire(import.meta.url).resolve('koffi')
  const child=spawn(process.execPath,['-'],{
    windowsHide:true,stdio:['pipe','ignore','pipe','ipc'],
    env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,NODE_ENV:process.env.NODE_ENV,AMIRAHCO_STORAGE_WORKER_DATA:JSON.stringify({...data,koffiPath})},
  })
  const events=new EventEmitter(),pending:unknown[]=[]
  let ready=false,diagnostic='',exitCode:number|undefined
  const exited=new Promise<number>(resolve=>child.once('close',(code)=>{exitCode=code??1;resolve(exitCode)}))
  child.stderr?.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-4096)})
  const ref=()=>{child.ref();child.channel?.ref();if(child.stderr&&'ref' in child.stderr&&typeof child.stderr.ref==='function')child.stderr.ref()}
  const unref=()=>{child.unref();child.channel?.unref();if(child.stderr&&'unref' in child.stderr&&typeof child.stderr.unref==='function')child.stderr.unref()}
  child.on('message',message=>{
    if(message&&typeof message==='object'&&'storageStartupError' in message){diagnostic=String(message.storageStartupError).slice(-4096);return}
    if(message&&typeof message==='object'&&'storageReady' in message){ready=true;for(const queued of pending.splice(0))child.send(queued as object);return}
    events.emit('message',message)
  })
  child.on('error',error=>events.emit('error',error))
  child.on('close',code=>{events.emit('exit',code,new Error(`Native Windows writer exited (${code}): ${diagnostic}`))})
  child.stdin?.on('error',error=>events.emit('error',error))
  child.stdin?.end(`try {\n${windowsSource}\n${source}\nprocess.send({storageReady:true});\n} catch(error) {process.send({storageStartupError:String(error)},()=>process.exit(1));}\n`)
  return {
    on:(event,listener)=>events.on(event,listener),
    postMessage:message=>{if(ready)child.send(message as object);else pending.push(message)},
    ref,unref,
    terminate:async()=>{ref();if(exitCode===undefined)child.kill();return exited},
  }
}
