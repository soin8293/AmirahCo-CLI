import test from 'node:test'
import assert from 'node:assert/strict'
import {selectTerminalProfile,shouldSelectTerminalProfile,TERMINAL_PROFILE,RUN_IN_PLACE} from './windows-terminal-profile.mjs'
const env={LOCALAPPDATA:'C:/Users/Tester/AppData/Local',WT_PROFILE_ID:'{other}'}
const tty={stdin:true,stdout:true}
const settings=JSON.stringify({profiles:{list:[{guid:TERMINAL_PROFILE,icon:'C:/icons/terminal.ico'}]}})
function fixture(extra={}){const calls=[];const options={args:[],env,tty,cwd:'C:/My Projects/Bakery Website',exists:()=>true,read:()=>settings,launcherPath:'C:/My Programs/AmirahCo CLI/bin/amirahcocli.cmd',token:'11111111-1111-1111-1111-111111111111',spawn:(...args)=>{calls.push(args);return {status:0}},...extra};return {options,calls}}
test('plain interactive command automatically selects the existing branded profile and caller directory',()=>{
 const {options,calls}=fixture();assert.equal(selectTerminalProfile(options),0);assert.equal(calls.length,1)
 assert.deepEqual(calls[0][1].slice(0,11),['-w','new','new-tab','-p',TERMINAL_PROFILE,'-d',options.cwd,'--inheritEnvironment','--title','AmirahCo-CLI-'+options.token,'--useApplicationTitle'])
 const argv=calls[0][1]
 assert.equal(argv[argv.indexOf('-IconPath')+1].endsWith('amirahco-white-on-emerald.ico'),true)
 assert.equal(argv[argv.indexOf('-LauncherPath')+1],options.launcherPath)
 assert.equal(argv[argv.indexOf('-WindowToken')+1],'AmirahCo-CLI-'+options.token)
 assert.equal(argv[argv.indexOf('-File')+1].endsWith('windows-terminal-window.ps1'),true)
 assert.equal(calls[0][2].stdio,'inherit');assert.equal(calls[0][2].env,env)
})
test('already-selected profile does not recurse and normal arguments stay in the current shell',()=>{
 for(const extra of [{env:{...env,WT_PROFILE_ID:TERMINAL_PROFILE.toUpperCase(),_AMIRAHCO_WINDOW_BOOTSTRAPPED:'1'}},{args:['--resume','same session']},{args:['--print','text; & "quoted"']},{tty:{stdin:false,stdout:true}},{env:{...env,CI:'1'}}]){
  const {options,calls}=fixture(extra);assert.equal(selectTerminalProfile(options),RUN_IN_PLACE);assert.equal(calls.length,0)
 }
})
test('explicit provider and state overrides are forwarded unchanged through native environment inheritance',()=>{
 for(const key of ['OPENAI_API_KEY','ANTHROPIC_BASE_URL','OPENCLAUDE_CONFIG_DIR','CLAUDE_CODE_USE_OPENAI','XDG_STATE_HOME','AMIRAHCO_OWNER_SKILLS_FILE','AMIRAHCO_SKILL_ROOTS','NODE_OPTIONS','HTTPS_PROXY']){
  const inherited={...env,[key]:'fixture'}
  const {options,calls}=fixture({env:inherited})
  assert.equal(shouldSelectTerminalProfile([],inherited,tty),true)
  assert.equal(selectTerminalProfile(options),0)
  assert.equal(calls[0][2].env,inherited)
  assert.equal(calls[0][1].includes('--inheritEnvironment'),true)
 }
})
test('missing terminal/profile/icon falls back, while uncertain handoffs cannot start another session',()=>{
 for(const extra of [{exists:()=>false},{read:()=>'{bad json'},{read:()=>'{"profiles":{"list":[]}}'},{spawn:()=>({error:{code:'ENOENT'}})}])assert.equal(selectTerminalProfile(fixture(extra).options),RUN_IN_PLACE)
 assert.equal(selectTerminalProfile(fixture({spawn:()=>({status:1})}).options),1)
 assert.equal(selectTerminalProfile(fixture({spawn:()=>({error:{code:'EACCES'}})}).options),1)
})

test('an old profile window without verified window branding receives a fresh dedicated window',()=>{
 const {options,calls}=fixture({env:{...env,WT_PROFILE_ID:TERMINAL_PROFILE}})
 assert.equal(selectTerminalProfile(options),0);assert.equal(calls[0][1][1],'new')
})
