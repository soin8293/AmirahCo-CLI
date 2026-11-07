import {readFileSync} from 'node:fs'
import {join,win32} from 'node:path'

export function windowsStartupEnvironment(args,env,terminal){
  if(Number(terminal.nodeVersion.split('.')[0])<22)throw new Error('AmirahCo CLI requires native Windows Node.js 22 or newer.')
  if(args.length===0&&(!terminal.stdinTTY||!terminal.stdoutTTY))throw new Error('Open AmirahCo CLI in an interactive terminal. For scripted requests, use --print.')
  const next={...env}
  if(!next.OPENCLAUDE_CONFIG_DIR){
    if(!next.LOCALAPPDATA)throw new Error('Windows LOCALAPPDATA is unavailable. Set OPENCLAUDE_CONFIG_DIR to your native Windows configuration directory.')
    next.OPENCLAUDE_CONFIG_DIR=join(next.LOCALAPPDATA,'AmirahCo CLI','config')
  }
  next.CLAUDE_CODE_NO_FLICKER??='1'
  next.CLAUDE_CODE_DISABLE_MOUSE??='0'
  delete next.AMIRAHCO_STARTUP_QUESTIONS
  if(args.length===0)next.AMIRAHCO_STARTUP_QUESTIONS='1'
  if(!next.AMIRAHCO_SKILL_ROOTS&&next.AMIRAHCO_OWNER_SKILLS_FILE){
    const value=JSON.parse(readFileSync(next.AMIRAHCO_OWNER_SKILLS_FILE,'utf8'))
    if(!Array.isArray(value.roots)||value.roots.some(root=>typeof root!=='string'))throw new Error('Owner skill configuration must contain roots as an array of absolute paths.')
    const roots=value.roots.map(root=>root.replace(/^\/mnt\/([a-z])\//i,(_,drive)=>`${drive.toUpperCase()}:/`))
    if(roots.some(root=>!win32.isAbsolute(root)||root.startsWith('/')))throw new Error('Owner skill roots must identify Windows paths; unsupported paths were not silently discarded.')
    next.AMIRAHCO_SKILL_ROOTS=JSON.stringify(roots)
  }
  return next
}
