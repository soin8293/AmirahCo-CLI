import {execFile} from 'node:child_process'
import {existsSync} from 'node:fs'
import {realpath,stat} from 'node:fs/promises'
import {delimiter,isAbsolute,join,resolve} from 'node:path'
import {promisify} from 'node:util'
import {z} from 'zod'
import {getBundledWorkflowPaths} from './workflowPaths.js'

const run=promisify(execFile)
const identity=z.object({executable:z.string().min(1),platform:z.string(),version:z.tuple([z.number().int(),z.number().int(),z.number().int()])}).strict()
const probe='import sys,json,sqlite3; print(json.dumps({"executable":sys.executable,"platform":sys.platform,"version":list(sys.version_info[:3])}))'

/** Resolve before effects; discovery never dispatches or replays a workflow action. */
export async function resolveWorkflowPython():Promise<string>{
  const configured=process.env.AMIRAHCO_PYTHON
  const paths=getBundledWorkflowPaths()
  const bundled=paths?resolve(paths.root,'../python',process.platform==='win32'?'python.exe':'bin/python3'):undefined
  const candidates:string[]=[]
  if(configured){
    if(!isAbsolute(configured))throw new Error('AMIRAHCO_PYTHON must name one absolute Python executable, without shell arguments.')
    candidates.push(configured)
  }else if(bundled&&existsSync(bundled))candidates.push(bundled)
  else {
    if(process.platform==='win32'){
      if(process.env.LOCALAPPDATA)candidates.push(join(process.env.LOCALAPPDATA,'Programs/Python/Launcher/py.exe'))
      if(process.env.SystemRoot)candidates.push(join(process.env.SystemRoot,'py.exe'))
    }
    for(const directory of (process.env.PATH||'').split(delimiter)){
      if(!isAbsolute(directory)||resolve(directory)===process.cwd()||/[\\/]WindowsApps(?:[\\/]|$)/i.test(directory))continue
      for(const name of process.platform==='win32'?['python.exe','python3.exe','py.exe']:['python3','python'])candidates.push(join(directory,name))
    }
  }
  for(const candidate of [...new Set(candidates)]){
    if(!existsSync(candidate))continue
    try{
      const executable=await realpath(candidate)
      if(!(await stat(executable)).isFile())continue
      const launcher=process.platform==='win32'&&/[\\/]py\.exe$/i.test(executable)
      const read=async(file:string,args:string[])=>{
        const {stdout}=await run(file,[...args,'-I','-X','utf8','-c',probe],{timeout:5000,maxBuffer:65536,windowsHide:true})
        const result=identity.parse(JSON.parse(stdout))
        if(result.platform!==process.platform||result.version[0]!==3||result.version[1]<11||!isAbsolute(result.executable))throw new Error('Python 3.11+ with native sqlite3 is required.')
        return realpath(result.executable)
      }
      const selected=await read(executable,launcher?['-3']:[])
      if(selected!==executable&&await read(selected,[])!==selected)throw new Error('Python identity did not match its verified executable.')
      return selected
    }catch(error){
      if(configured||bundled&&candidate===bundled)throw new Error('The selected workflow Python is unavailable or incompatible. Use a native Python 3.11+ executable with sqlite3; the original activation is preserved.',{cause:error})
    }
  }
  throw new Error('Workflow Python is unavailable. Install native Python 3.11+ or set AMIRAHCO_PYTHON to its absolute executable. The original activation is preserved; no workflow action was replayed.')
}

export function runtimeCommand(executable:string,args:string[],platform:NodeJS.Platform=process.platform):string{
  const quote=(value:string)=>platform==='win32'?`'${value.replaceAll("'","''")}'`:`'${value.replaceAll("'",`'"'"'`)}'`
  return `${platform==='win32'?'& ':''}${[executable,...args].map(quote).join(' ')}`
}
