import {existsSync,readFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'

export const TERMINAL_PROFILE='{79295d38-53bd-48b2-9ea4-b5a2b5db1b12}'
export const RUN_IN_PLACE=10
export function shouldSelectTerminalProfile(args,env,tty){
 if(args.length||!tty.stdin||!tty.stdout||env.CI||(env.WT_PROFILE_ID?.toLowerCase()===TERMINAL_PROFILE&&env._AMIRAHCO_WINDOW_BOOTSTRAPPED==='1'))return false
 return true
}
export function selectTerminalProfile({args,env,tty,cwd,launcherPath=join(fileURLToPath(new URL('.',import.meta.url)),'amirahcocli.cmd'),spawn=spawnSync,exists=existsSync,read=readFileSync,token=randomUUID()}){
 if(!shouldSelectTerminalProfile(args,env,tty)||!env.LOCALAPPDATA)return RUN_IN_PLACE
 const settings=join(env.LOCALAPPDATA,'Packages','Microsoft.WindowsTerminal_8wekyb3d8bbwe','LocalState','settings.json')
 const wt=join(env.LOCALAPPDATA,'Microsoft','WindowsApps','wt.exe')
 let profile
 try{
  profile=JSON.parse(read(settings,'utf8')).profiles.list.find(p=>p.guid?.toLowerCase()===TERMINAL_PROFILE)
  if(!profile||!exists(profile.icon))return RUN_IN_PLACE
 }catch{return RUN_IN_PLACE}
 const script=fileURLToPath(new URL('./windows-terminal-window.ps1',import.meta.url))
 const icon=fileURLToPath(new URL('../assets/terminal-icons/amirahco-white-on-emerald.ico',import.meta.url))
 if(!exists(script)||!exists(icon)||!exists(launcherPath))return RUN_IN_PLACE
 const powershell=join(env.SystemRoot||'C:/Windows','System32','WindowsPowerShell','v1.0','powershell.exe')
 const result=spawn(wt,['-w','new','new-tab','-p',TERMINAL_PROFILE,'-d',cwd,'--inheritEnvironment','--title','AmirahCo-CLI-'+token,'--useApplicationTitle',powershell,'-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-WindowToken','AmirahCo-CLI-'+token,'-IconPath',icon,'-LauncherPath',launcherPath],{stdio:'inherit',env})
 if(result.error?.code==='ENOENT')return RUN_IN_PLACE
 // Never create a second session after an uncertain terminal handoff.
 return result.error?1:result.status===0?0:1
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=process.argv.slice(2)
 const hasLauncher=input[0]==='--launcher'&&input[2]==='--'
 process.exitCode=selectTerminalProfile({args:hasLauncher?input.slice(3):input,launcherPath:hasLauncher?input[1]:undefined,env:process.env,tty:{stdin:process.stdin.isTTY,stdout:process.stdout.isTTY},cwd:process.cwd()})
 if(process.exitCode===1)process.stderr.write('AmirahCo CLI could not open its terminal tab. No second session was started.\n')
}
