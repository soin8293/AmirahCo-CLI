import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {selectTerminalProfile,TERMINAL_PROFILE} from './windows-terminal-profile.mjs'

test('dedicated Terminal window retains real AmirahCo icons after native title changes',{
 skip:process.platform!=='win32'||!process.env.AMIRAHCO_WINDOW_ICON_TEST_ROOT,
 timeout:30000,
},async()=>{
 const root=mkdtempSync(join(resolve(process.env.AMIRAHCO_WINDOW_ICON_TEST_ROOT),'Window Icon With Spaces '))
 const receipt=join(root,'window.json'),native=join(root,'native.json')
 const program=join(root,'fixture.mjs'),launcher=join(root,'fixture.cmd')
 writeFileSync(program,`import {writeFileSync} from 'node:fs';
process.stdout.write('\\x1b]0;AmirahCo icon stability test\\x07');
writeFileSync(${JSON.stringify(native)},JSON.stringify({cwd:process.cwd(),profile:process.env.WT_PROFILE_ID,bootstrapped:process.env._AMIRAHCO_WINDOW_BOOTSTRAPPED,stdinTTY:process.stdin.isTTY,stdoutTTY:process.stdout.isTTY,providerOverride:process.env.OPENAI_API_KEY,stateOverride:process.env.OPENCLAUDE_CONFIG_DIR}));
setTimeout(()=>{},16000);
`)
 writeFileSync(launcher,`@echo off\r\n"${process.execPath}" "${program}"\r\n`)
 const env={...process.env}
 for(const key of Object.keys(env)){
  if(/^(OPENAI_|ANTHROPIC_|CLAUDE_CODE_|OPENCLAUDE_|AMIRAHCO_|GEMINI_|GOOGLE_API_KEY$|XDG_STATE_HOME$|NODE_OPTIONS$|HTTPS?_PROXY$|ALL_PROXY$|NO_PROXY$|CI$)/i.test(key))delete env[key]
 }
 env.OPENAI_API_KEY='not-a-key-window-inheritance-fixture'
 env.OPENCLAUDE_CONFIG_DIR=join(root,'Isolated State With Spaces')
 delete env._AMIRAHCO_WINDOW_BOOTSTRAPPED
 const result=selectTerminalProfile({args:[],env,tty:{stdin:true,stdout:true},cwd:root,launcherPath:launcher,
  spawn:(command,args,options)=>spawnSync(command,[...args,'-ReceiptPath',receipt],options),
 })
 assert.equal(result,0)
 for(let i=0;i<150&&(!existsSync(receipt)||!existsSync(native));i++)await new Promise(r=>setTimeout(r,100))
 const window=JSON.parse(readFileSync(receipt,'utf8'))
 assert.equal(window.smallIconVerified,true,JSON.stringify(window))
 assert.equal(window.largeIconVerified,true)
 const session=JSON.parse(readFileSync(native,'utf8'))
 assert.equal(session.cwd,root);assert.equal(session.profile,TERMINAL_PROFILE)
 assert.equal(session.providerOverride,env.OPENAI_API_KEY);assert.equal(session.stateOverride,env.OPENCLAUDE_CONFIG_DIR)
 assert.equal(session.bootstrapped,'1');assert.equal(session.stdinTTY,true);assert.equal(session.stdoutTTY,true)
 const quote=value=>"'"+value.replaceAll("'","''")+"'"
 const inspect=join(root,'inspect.ps1')
 writeFileSync(inspect,`Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;using System.Text;using System.Runtime.InteropServices;
public static class IconReadback {
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder text,int length);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
}
'@
$title=New-Object Text.StringBuilder 256
[void][IconReadback]::GetWindowText([IntPtr]${window.window},$title,256)
[Console]::WriteLine($title.ToString())
foreach($kind in @(0,1)){
 $icon=[IconReadback]::SendMessage([IntPtr]${window.window},0x7f,[IntPtr]$kind,[IntPtr]::Zero)
 if($icon -eq [IntPtr]::Zero){throw 'Live window icon missing'}
 $bitmap=[System.Drawing.Icon]::FromHandle($icon).ToBitmap()
 try{$bitmap.Save((${quote(receipt)}+'.late-'+$kind+'.png'),[System.Drawing.Imaging.ImageFormat]::Png)}finally{$bitmap.Dispose()}
}
`)
 const check=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',inspect],{encoding:'utf8'})
 assert.equal(check.status,0,check.stderr)
 assert.equal(check.stdout.trim(),'AmirahCo icon stability test')
 const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex')
 for(const kind of [0,1])assert.equal(hash(receipt+'.late-'+kind+'.png'),hash(receipt+'.icon-'+kind+'.png'))
 writeFileSync(join(root,'receiving.json'),JSON.stringify({state:'passed',window:window.window,smallAndLargeIconsStable:true,nativeSession:session},null,2))
 console.log('Native window-icon receiving:',root)
})
