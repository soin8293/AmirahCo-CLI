import {access,stat} from 'node:fs/promises'
import {isAbsolute,resolve} from 'node:path'
import {gracefulShutdown} from '../../utils/gracefulShutdown.js'
import type {LogOption} from '../../types/logs.js'
import type {LocalJSXCommandContext} from '../../types/command.js'
import {getOriginalCwd} from '../../bootstrap/state.js'
import {validateUuid} from '../../utils/uuid.js'

/** Keep the selected backend, but do not carry old project/permission flags. */
export function projectResumeArguments(argv:string[],sessionId:string):string[]{
  const args=[argv[1]!, '--resume',sessionId]
  const valued=new Set(['--provider','--model','--effort'])
  const flags=new Set(['--bare','--no-session-persistence'])
  for(let i=2;i<argv.length;i++){
    const arg=argv[i]!,key=arg.split('=')[0]!
    if(flags.has(arg))args.push(arg)
    else if(valued.has(key)){
      if(arg.includes('='))args.push(arg)
      else if(argv[i+1]&&!argv[i+1]!.startsWith('-'))args.push(arg,argv[++i]!)
    }
  }
  return args
}

export async function resumeAcrossProjects(sessionId:string,log:LogOption,context:LocalJSXCommandContext):Promise<boolean>{
  if(!log.projectPath||resolve(log.projectPath)===resolve(getOriginalCwd()))return false
  if(!validateUuid(sessionId)||!isAbsolute(log.projectPath)||!log.fullPath||!isAbsolute(log.fullPath))throw new Error('Saved session has no valid project directory or transcript. Its original files are preserved.')
  if(!(await stat(log.projectPath)).isDirectory())throw new Error('The saved project folder is unavailable. Restore its original folder before resuming.')
  await access(log.fullPath)
  if(typeof process.execve!=='function')throw new Error('Reopening a different project currently requires the Node 22+ WSL runtime. Its session is preserved.')
  const args=[process.execPath,...projectResumeArguments(process.argv,sessionId)]
  const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined))
  await gracefulShutdown(0,'other',{
    getAppState:context.getAppState,setAppState:context.setAppState,
    beforeExit:()=>{
      process.chdir(log.projectPath!)
      process.execve!(process.execPath,args,env)
    },
  })
  return true
}
