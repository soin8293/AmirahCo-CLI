import {PassThrough} from 'node:stream'
import {stripVTControlCharacters} from 'node:util'
import React,{useLayoutEffect} from 'react'
import {afterAll,beforeAll,expect,mock,test} from 'bun:test'
import {createRoot,Box} from '../ink.js'
import {AlternateScreen} from '../ink/components/AlternateScreen.js'
import instances from '../ink/instances.js'
import {cellAt,type Screen} from '../ink/screen.js'
import {AppStateProvider,useAppStateStore,useSetAppState} from '../state/AppState.js'
import {KeybindingSetup} from '../keybindings/KeybindingProviderSetup.js'
import {useRegisterKeybindingContext} from '../keybindings/KeybindingContext.js'
import {useKeybindings} from '../keybindings/useKeybinding.js'
import {FullscreenLayout} from './FullscreenLayout.js'
import {StartupBanner,GlobeActivityContext,type GlobeActivity} from './StartupBanner.js'
import {formatStartupScreen} from './StartupScreen.js'
import {renderElricMatrix,selectElricMask} from './LogoV2/elricMatrix.js'
import {ScrollKeybindingHandler} from './ScrollKeybindingHandler.js'
import type {ScrollBoxHandle} from '../ink/components/ScrollBox.js'
import {AgentSessionTabs} from './AgentSessionTabs.js'
import {call} from '../commands/start/start.js'
import {IntakeStore,NativeIntakeSession,intakeWorkHoldReason,setIntakeWorkHold,type IntakeSnapshot,type IntakeMutation} from '../services/projectRecords/intakeStore.js'
import {acquireSharedMutationLock,releaseSharedMutationLock} from '../test/sharedMutationLock.js'
const configModule=await import('../utils/config.js')
let config={...configModule.getGlobalConfig(),amirahcoWelcomeSeen:false}
beforeAll(async()=>{
  await acquireSharedMutationLock('NativeStartup.test.tsx')
  mock.module('../utils/config.js',()=>({...configModule,getGlobalConfig:()=>config,saveGlobalConfig:(update:any)=>{config=update(config)}}))
})
afterAll(()=>{mock.restore();releaseSharedMutationLock()})
async function wait(check:()=>boolean){const start=Date.now();while(Date.now()-start<3000){if(check())return;await Bun.sleep(15)}throw new Error('Expected native UI state was not reached')}
// UI-only fixture. Actual SQLite/worker interruption tests run separately under Node.
function uiStore(){
  const saved=new Map<string,IntakeSnapshot>()
  return {save:async(input:IntakeMutation)=>{const previous=saved.get(input.projectId);const value:IntakeSnapshot={projectId:input.projectId,sequence:(previous?.sequence||0)+1,answers:{...previous?.answers,...input.answers},clarification:input.clarification??previous?.clarification,step:input.step,phase:input.phase,stopped:input.type==='stop'||(Boolean(previous?.stopped)&&input.type!=='resume'),projectionPending:false};saved.set(input.projectId,value);return value},read:async(id:string)=>{const value=saved.get(id);if(!value)throw new Error('No saved fixture');return value},repair:async(id:string)=>saved.get(id)!,list:async()=>[...saved.values()],recover:async()=>{},close:async()=>{}} as unknown as IntakeStore
}
async function open(seen=false,agent=false,viewed=false,columns=100,rows=40,reducedMotion=false,storage=uiStore(),requester:any=async()=>{throw new Error('Unexpected model request in a manual UI fixture')},prdRequester:any=async()=>{throw new Error('Unexpected PRD request in a manual UI fixture')}){
  config={...config,amirahcoWelcomeSeen:seen}
  const globals=globalThis as Record<string,unknown>,previousMacro=globals.MACRO,previousFullscreen=process.env.CLAUDE_CODE_NO_FLICKER
  globals.MACRO={VERSION:'test'};process.env.CLAUDE_CODE_NO_FLICKER='1'
  const output=new PassThrough() as any;output.columns=columns;output.rows=rows;output.on('data',()=>{})
  const input=new PassThrough() as any;input.isTTY=true;input.setRawMode=()=>{};input.ref=()=>{};input.unref=()=>{}
  let done=false;let deliveries=0;let nextInput='';let store:any;let completion:any;let historySearches=0;let externalEditors=0
  // Production REPL keeps Chat handlers registered during dialogs. Include them
  // so its chord interceptor and global history bindings participate in this test.
  function NativeChatBindings(){useRegisterKeybindingContext('Chat',true);useKeybindings({'chat:externalEditor':()=>{externalEditors++},'history:search':()=>{historySearches++}},{context:'Chat'});return null}
  const scroll=React.createRef<ScrollBoxHandle>()
  function Seed(){store=useAppStateStore();const set=useSetAppState();useLayoutEffect(()=>{scroll.current?.scrollTo(0);set(previous=>({...previous,settings:{...previous.settings,prefersReducedMotion:reducedMotion},...(agent||viewed?{viewingAgentTaskId:viewed?'fixture':undefined,viewSelectionMode:viewed?'viewing-agent':'none',tasks:{...previous.tasks,fixture:{id:'fixture',type:'local_agent',agentId:'fixture',description:'Fixture agent',status:'completed',retain:viewed,diskLoaded:true,messages:[]}}}:{})} as any))},[]);return null}
  const session=new NativeIntakeSession(storage,'native-ui-fixture')
  const node=await call((result,options)=>{deliveries++;done=true;nextInput=options?.nextInput??'';completion={result,options}},undefined,undefined,session,requester,prdRequester)
  const root=await createRoot({stdout:output,stdin:input,exitOnCtrlC:false,patchConsole:false})
  // Native AlternateScreen addresses process.stdout; this fixture has its own stream.
  instances.get(output)?.setAltScreenActive(true,true)
  const render=(activity:GlobeActivity='idle')=>root.render(<AppStateProvider><KeybindingSetup><AlternateScreen mouseTracking={true}><NativeChatBindings/><Box height={rows} flexDirection="column"><Seed/>{agent?<AgentSessionTabs/>:<><ScrollKeybindingHandler scrollRef={scroll} isActive={true}/><FullscreenLayout bottomMaxHeight="75%" scrollRef={scroll} scrollable={<GlobeActivityContext value={activity}><StartupBanner/></GlobeActivityContext>} bottom={node} hideSticky={true}/></>}</Box></AlternateScreen></KeybindingSetup></AppStateProvider>)
  render()
  const frame=()=>{const screen=(instances.get(output) as unknown as {frontFrame:{screen:Screen}})?.frontFrame.screen;if(!screen)return '';return Array.from({length:screen.height},(_,y)=>Array.from({length:screen.width},(_,x)=>cellAt(screen,x,y)?.char??' ').join('')).join('\n')}
  return{input,frame,session,storage,historySearches:()=>historySearches,externalEditors:()=>externalEditors,activity:render,scroll:()=>scroll.current,done:()=>done,deliveries:()=>deliveries,next:()=>nextInput,completion:()=>completion,state:()=>store.getState(),close:()=>{root.unmount();input.end();output.end();globals.MACRO=previousMacro;if(previousFullscreen===undefined)delete process.env.CLAUDE_CODE_NO_FLICKER;else process.env.CLAUDE_CODE_NO_FLICKER=previousFullscreen}}
}
test('startup opens the session-first home without click-through or template screens',async()=>{
  const ui=await open()
  const focused=(label:string)=>ui.frame().split('\n').some(line=>line.includes(label)&&/[>❯]/.test(line.slice(0,line.indexOf(label))))
  try{await wait(()=>ui.frame().includes('New project'));expect(ui.frame()).toContain('New chat');expect(ui.frame()).toContain('Session history');expect(ui.frame()).toContain('Open saved project');expect(ui.frame()).toContain('Guided setup, PRD, and project work');expect(ui.frame()).toContain('Start chatting immediately');expect(ui.frame()).toContain('█████');expect(ui.frame()).not.toContain('Sessions are the top level');expect(ui.frame()).not.toContain('Get started');expect(ui.frame()).not.toContain('Go to home');expect(ui.frame()).not.toContain('Open terminal for any LLM');await wait(()=>focused('New project'));ui.input.write('\x1b[B');await wait(()=>focused('Open saved project'));ui.input.write('\x1b[A');await wait(()=>focused('New project'));expect(Object.keys(ui.state().tasks)).toHaveLength(0);ui.input.write('\x11');await Bun.sleep(20);expect(await ui.storage.list()).toHaveLength(0)}finally{ui.close()}
})
test('fresh fields, editable details and confirmed context starts the next lead context step without starting workers',async()=>{
  const ui=await open(true,false,true)
  const enter=async(label:string)=>{ui.input.write('\r');try{await wait(()=>ui.frame().includes(label))}catch(error){console.error('Expected '+label+'; actual frame:\n'+ui.frame());throw error}}
  try{
    await wait(()=>ui.frame().includes('New project'));await enter('What would you like to make?')
    ui.input.write('Build a bakery website');await Bun.sleep(30);await enter('What should it do?')
    expect(ui.frame()).not.toContain('Build a bakery website')
    ui.input.write('Show a menu');await Bun.sleep(30);await enter('What would a successful result look like?')
    expect(ui.frame()).not.toContain('Show a menu')
    ui.input.write('A readable menu');await Bun.sleep(30);await enter('Any documents or notes?');expect(ui.frame()).not.toContain('A readable menu');await enter('Personalized questions');ui.input.write('\x1b[B');await Bun.sleep(25);await enter('How many agents would you like?')
    expect(ui.frame()).toContain('1 agent (Recommended)');await enter('Review your project context')
    expect(ui.done()).toBe(false)
    ui.input.write('\x1b[B');await Bun.sleep(30);await enter('What would you like to change?')
    for(let index=0;index<6;index++){ui.input.write('\x1b[B');await Bun.sleep(20)}
    await enter('How many agents would you like?')
    ui.input.write('\x1b[B');await Bun.sleep(30);await enter('Review your project context')
    expect(ui.frame()).toContain('Continue context with AI');expect(Object.keys(ui.state().tasks)).toHaveLength(1)
    ui.input.write('\r');await wait(ui.done)
    expect(ui.state().viewingAgentTaskId).toBeUndefined()
    expect(ui.completion().options.shouldQuery).toBe(true)
    const brief=ui.completion().options.metaMessages[0]
    expect(brief).toContain('Build a bakery website');expect(brief).toContain('Show a menu');expect(brief).toContain('A readable menu');expect(brief).toContain('"requestedAgents": 2')
    expect(Object.keys(ui.state().tasks)).toHaveLength(1)
  }finally{ui.close()}
})

test('80x24 shows the complete unscaled graphic across wheel scrolling and native jump-to-bottom',async()=>{
  const ui=await open(false,false,false,80,24,true)
  try{
    await wait(()=>ui.frame().includes('New project'))
    ui.input.write('\x1b[1;5H');await wait(()=>ui.scroll()?.getScrollTop()===0)
    const expected=renderElricMatrix(selectElricMask(78)!,0)+'\n'+formatStartupScreen(undefined,80,true,0,false)
    const wanted=stripVTControlCharacters(expected).split('\n').map(line=>line.trimEnd()).filter(line=>line.trim())
    const seen=new Set<string>()
    const collect=()=>ui.frame().split('\n').forEach(line=>seen.add(line.trimEnd()))
    collect()
    for(let index=0;index<50;index++){ui.input.write('\x1b[<65;40;3M');await Bun.sleep(25);collect()}
    expect(wanted.filter(line=>!seen.has(line))).toEqual([])
    expect([...seen].join('\n')).toContain('Provider')
    expect([...seen].join('\n')).toContain('Model')
    expect([...seen].join('\n')).toContain('Endpoint')
    expect(ui.frame()).toContain('AMIRAHCO CLI vtest')
    expect(ui.frame()).toContain('Settings')
    ui.input.write('\x1b[1;5H');await wait(()=>ui.frame().includes('Jump to bottom'))
    const lines=ui.frame().split('\n'),row=lines.findIndex(line=>line.includes('Jump to bottom')),column=lines[row]!.indexOf('Jump to bottom')
    ui.input.write(`\x1b[<0;${column+2};${row+1}M\x1b[<0;${column+2};${row+1}m`)
    await Bun.sleep(100)
    expect(ui.scroll()?.getScrollTop()).toBe(Math.max(0,ui.scroll()!.getScrollHeight()-ui.scroll()!.getViewportHeight()))
    await wait(()=>ui.frame().includes('AMIRAHCO CLI vtest')&&!ui.frame().includes('Jump to bottom'))
    ui.input.write('\x1b[1;5H');await wait(()=>ui.frame().includes('Jump to bottom'))
    ui.input.write('\x1b[1;5F');await wait(()=>!ui.frame().includes('Jump to bottom'))
    expect(ui.frame()).toContain('AMIRAHCO CLI vtest')
  }finally{ui.close()}
})

test('native globe keeps moving at idle and activity, respecting reduced motion',async()=>{
  for(const reduced of [false,true]){
    const ui=await open(false,false,false,100,40,reduced)
    try{
      await wait(()=>ui.frame().includes('New project'))
      const original=ui.frame();ui.activity('working');await Bun.sleep(700)
      if(reduced)expect(ui.frame()).toBe(original);else expect(ui.frame()).not.toBe(original)
      ui.activity('idle');await Bun.sleep(80);const idle=ui.frame();await Bun.sleep(350);if(reduced)expect(ui.frame()).toBe(idle);else expect(ui.frame()).not.toBe(idle)
    }finally{ui.close()}
  }
})

test('80x24 asks agent count at the end, explains its suggestion and accepts a custom total',async()=>{
  const ui=await open(false,false,false,80,24,true)
  const enter=async(label:string)=>{ui.input.write('\r');try{await wait(()=>ui.frame().includes(label))}catch(error){console.error('Expected '+label+'; actual frame:\n'+ui.frame());throw error}}
  try{
    await wait(()=>ui.frame().includes('New project'));await enter('What would you like to make?')
    ui.input.write('A mobile app');await Bun.sleep(25);await enter('What should it do?')
    ui.input.write('API and SQL database');await Bun.sleep(25);await enter('What would a successful result look like?')
    ui.input.write('Sync data');await Bun.sleep(25);await enter('Any documents or notes?')
    await enter('Personalized questions');ui.input.write('\x1b[B');await Bun.sleep(25);await enter('How many agents would you like?')
    expect(ui.frame()).toContain('3 agents (Recommended)')
    expect(ui.frame()).toContain('workstreams')
    expect(ui.frame()).toContain('Choose another number')
    for(let index=0;index<3;index++){ui.input.write('\x1b[B');await Bun.sleep(20)}
    await enter('How many agents?');ui.input.write('7');await Bun.sleep(25);await enter('Review your project context')
    expect(ui.frame()).toContain('Back to home')
    ui.input.write('\r');await wait(ui.done)
    expect(ui.completion().options.metaMessages[0]).toContain('"requestedAgents": 7')
    expect(Object.keys(ui.state().tasks)).toHaveLength(0)
  }finally{ui.close()}
})
test('clicking an in-program tab selects and retains the existing native agent task',async()=>{
  const ui=await open(true,true)
  try{await wait(()=>ui.frame().includes('Fixture agent'));ui.input.write('\x1b[<0;14;2M\x1b[<0;14;2m');await wait(()=>ui.state().viewingAgentTaskId==='fixture');expect(ui.state().tasks.fixture.retain).toBe(true);ui.input.write('\x1b[<0;3;2M\x1b[<0;3;2m');await wait(()=>ui.state().viewingAgentTaskId===undefined);expect(ui.state().tasks.fixture.retain).toBe(false)}finally{ui.close()}
})

test('Open saved project restores the saved question and Stop requires an explicit Resume',async()=>{
  const storage=uiStore();let ui=await open(false,false,false,100,40,false,storage)
  try{
    await wait(()=>ui.frame().includes('New project'));ui.input.write('\r');await wait(()=>ui.frame().includes('What would you like to make?'))
    ui.input.write('Saved native idea');await Bun.sleep(30);ui.input.write('\r');await wait(()=>ui.frame().includes('What should it do?'))
    ui.input.write('not submitted');await Bun.sleep(30);ui.input.write('\x11');await wait(()=>ui.frame().includes('Saved intake is stopped'))
    expect(ui.session.snapshot?.answers.idea).toBe('Saved native idea');expect(ui.session.snapshot?.answers.needs).toBeUndefined()
    const id=ui.session.projectId;ui.close();ui=await open(true,false,false,100,40,false,storage)
    await wait(()=>ui.frame().includes('New project'));expect(intakeWorkHoldReason('native-ui-fixture')).toContain('stopped');ui.input.write('\x1b[B');await Bun.sleep(40);ui.input.write('\r');await wait(()=>ui.frame().includes('Saved native idea'));expect(intakeWorkHoldReason('native-ui-fixture')).toContain('stopped');ui.input.write('\r');await wait(()=>ui.frame().includes('Resume saved intake'))
    expect(ui.done()).toBe(false);ui.input.write('\r');await wait(()=>ui.frame().includes('What should it do?'))
    expect(ui.session.projectId).toBe(id);expect(ui.session.isStopped).toBe(false);expect(ui.frame()).not.toContain('not submitted')
    ui.input.write('Fresh next answer');await Bun.sleep(30);ui.input.write('\r');await wait(()=>ui.frame().includes('What would a successful result look like?'))
    expect(ui.session.snapshot?.answers.needs).toBe('Fresh next answer');expect(Object.keys(ui.state().tasks)).toHaveLength(0)
  }finally{ui.close()}
})

test('Add API key opens native provider setup without creating intake or querying AI',async()=>{
  const ui=await open(true,false,false,80,24)
  try{
    await wait(()=>ui.frame().includes('Add API key'))
    for(let index=0;index<5;index++){ui.input.write('\x1b[B');await Bun.sleep(30)}
    ui.input.write('\r');await wait(()=>ui.frame().includes('Enter tester access key'))
    ui.input.write('\x1b[B\x1b[B');await Bun.sleep(30);ui.input.write('\r');await wait(()=>ui.done())
    expect(ui.next()).toBe('/provider')
    expect(ui.completion().options).toMatchObject({submitNextInput:true,shouldQuery:false})
    expect(ui.deliveries()).toBe(1)
    expect(ui.session.started).toBe(false)
    expect(await ui.storage.list()).toHaveLength(0)
    expect(Object.keys(ui.state().tasks)).toHaveLength(0)
  }finally{ui.close()}
})

test('Session history opens the native all-project session picker without reopening the questionnaire',async()=>{
  const ui=await open(true)
  try{
    await wait(()=>ui.frame().includes('Session history'))
    ui.input.write('\x1b[B\x1b[B');await Bun.sleep(40);ui.input.write('\r')
    await wait(()=>ui.done())
    expect(ui.next()).toBe('/resume --all')
    expect(ui.completion().options.submitNextInput).toBe(true)
    expect(ui.session.started).toBe(false)
  }finally{ui.close()}
})

test('Stop is visible immediately during a blocked save and retains the saved next question',async()=>{
  const storage=uiStore(),save=storage.save.bind(storage)
  let release!:()=>void
  const blocked=new Promise<void>(resolve=>{release=resolve})
  let first=true
  storage.save=async input=>{if(first&&input.type==='save'){first=false;await blocked}return save(input)}
  const ui=await open(false,false,false,100,40,false,storage)
  try{
    await wait(()=>ui.frame().includes('New project'));ui.input.write('\r');await wait(()=>ui.frame().includes('What would you like to make?'))
    ui.input.write('Keep this submitted idea');await Bun.sleep(30);ui.input.write('\r');await wait(()=>ui.frame().includes('Saving locally'))
    ui.input.write('\x11');await wait(()=>ui.frame().includes('Stop received'))
    expect(ui.session.isStopped).toBe(true);expect(ui.frame()).toContain('not yet saved')
    release();await wait(()=>ui.frame().includes('Saved intake is stopped'))
    expect(ui.session.snapshot?.answers.idea).toBe('Keep this submitted idea');expect(ui.session.snapshot?.step).toBe(2)
  }finally{release();ui.close()}
})

test('intake retry takes precedence over native history search without changing Chat chords',async()=>{
  const storage=uiStore(),save=storage.save.bind(storage)
  const operations:string[]=[]
  storage.save=async input=>{operations.push(input.operationId);if(operations.length===1)throw new Error('Fixture save unavailable');return save(input)}
  const ui=await open(false,false,false,100,40,false,storage)
  try{
    await wait(()=>ui.frame().includes('New project'));ui.input.write('\r');await wait(()=>ui.frame().includes('What would you like to make?'))
    ui.input.write('Retry the original answer');await Bun.sleep(30);ui.input.write('\r');await wait(()=>ui.frame().includes('Fixture save unavailable'))
    ui.input.write('\x12');await wait(()=>ui.frame().includes('What should it do?'))
    expect(ui.historySearches()).toBe(0);expect(operations).toHaveLength(2);expect(operations[0]).toBe(operations[1])
    expect(ui.session.snapshot?.answers.idea).toBe('Retry the original answer')
  }finally{ui.close()}
  const chat=await open(true,true)
  try{
    await wait(()=>chat.frame().includes('Fixture agent'));chat.input.write('\x12');await wait(()=>chat.historySearches()===1)
    chat.input.write('\x18');await Bun.sleep(30);chat.input.write('\x05');await wait(()=>chat.externalEditors()===1)
  }finally{chat.close()}
})

async function reachPersonalization(ui:Awaited<ReturnType<typeof open>>){
  await wait(()=>ui.frame().includes('New project'));ui.input.write('\r');await wait(()=>ui.frame().includes('What would you like to make?'))
  for(const [text,next] of [['A bakery website','What should it do?'],['Show menu and hours; no payments','What would a successful result look like?'],['Readable on a phone','Any documents or notes?']]){
    ui.input.write(text!);await Bun.sleep(30);ui.input.write('\r');await wait(()=>ui.frame().includes(next!))
  }
  ui.input.write('\r');await wait(()=>ui.frame().includes('Personalized questions'))
}
async function reachReviewWithoutAI(ui:Awaited<ReturnType<typeof open>>){
  await reachPersonalization(ui)
  ui.input.write('\x1b[B');await Bun.sleep(25);ui.input.write('\r');await wait(()=>ui.frame().includes('How many agents would you like?'))
  ui.input.write('\r');await wait(()=>ui.frame().includes('Continue context with AI'))
}
test('save context only remains an explicit local choice at review',async()=>{
  const ui=await open(false,false,false,100,40,true)
  try{
    await reachReviewWithoutAI(ui)
    ui.input.write('\x1b[B');await Bun.sleep(25);ui.input.write('\x1b[B');await Bun.sleep(25);ui.input.write('\r');await wait(ui.done)
    expect(ui.completion().options.shouldQuery).toBe(false);expect(ui.deliveries()).toBe(1)
    expect(ui.session.snapshot?.phase).toBe('context_ready');expect(Object.keys(ui.state().tasks)).toHaveLength(0)
  }finally{ui.close()}
})
test('final save must succeed before the automatic context handoff and retry delivers it once',async()=>{
  const storage=uiStore(),save=storage.save.bind(storage),operations:string[]=[]
  storage.save=async input=>{if(input.phase==='context_ready'){operations.push(input.operationId);if(operations.length===1)throw new Error('Fixture final save unavailable')}return save(input)}
  const ui=await open(false,false,false,100,40,true,storage)
  try{
    await reachReviewWithoutAI(ui);ui.input.write('\r');await wait(()=>ui.frame().includes('Fixture final save unavailable'))
    expect(ui.done()).toBe(false);expect(ui.deliveries()).toBe(0)
    ui.input.write('\x12');await wait(ui.done);ui.input.write('\r\r');await Bun.sleep(30)
    expect(ui.deliveries()).toBe(1);expect(ui.completion().options.shouldQuery).toBe(true)
    expect(operations).toHaveLength(2);expect(operations[0]).toBe(operations[1]);expect(ui.session.snapshot?.phase).toBe('context_ready')
  }finally{ui.close()}
})
test('Stop during the final save prevents the automatic context request',async()=>{
  const storage=uiStore(),save=storage.save.bind(storage)
  let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve})
  storage.save=async input=>{if(input.type==='save'&&input.phase==='context_ready')await blocked;return save(input)}
  const ui=await open(false,false,false,100,40,true,storage)
  try{
    await reachReviewWithoutAI(ui);ui.input.write('\r');await wait(()=>ui.frame().includes('Saving locally'))
    ui.input.write('\x11');await wait(()=>ui.session.isStopped);release();await wait(()=>ui.frame().includes('Saved intake is stopped'))
    expect(ui.deliveries()).toBe(0);expect(ui.done()).toBe(false);expect(ui.session.snapshot?.stopped).toBe(true)
  }finally{release();ui.close()}
})
const bakeryQuestions=[{intent:'content-owner',question:'Who will update the menu and hours?',why:'This determines how editing needs to work.',basedOn:['idea','needs']},{intent:'visitor-journey',question:'What should visitors do after reading the menu?',why:'This clarifies the main visitor journey without adding payments.',basedOn:['idea','needs']}]
test('personalized questions advance in the native wizard without a start message, then persist in confirmed context',async()=>{
  let requests=0;const ui=await open(false,false,false,100,40,true,uiStore(),async(facts:any,_signal:any,mayIssue:any)=>{expect(mayIssue()).toBe(true);expect(facts.needs).toContain('no payments');requests++;return {questions:bakeryQuestions,responseId:'native-fixture-response'}})
  try{
    await reachPersonalization(ui);expect(requests).toBe(0);ui.input.write('\r');await wait(()=>ui.frame().includes(bakeryQuestions[0]!.question));expect(requests).toBe(1)
    for(const [answer,next] of [['The bakery manager',bakeryQuestions[1]!.question],['Call the shop','How many agents would you like?']]){
      ui.input.write(answer!);await Bun.sleep(30);ui.input.write('\r');await wait(()=>ui.frame().includes(next!))
    }
    const saved=JSON.parse(ui.session.snapshot!.clarification!);expect(saved.responses['content-owner']).toBe('The bakery manager');expect(saved.responses['visitor-journey']).toBe('Call the shop');expect(saved.status).toBe('done')
    ui.input.write('\r');await wait(()=>ui.frame().includes('Continue context with AI'));ui.input.write('\r');await wait(ui.done)
    expect(ui.completion().options.metaMessages[0]).toContain('The bakery manager');expect(ui.completion().options.metaMessages[0]).toContain('Call the shop');expect(ui.completion().options.shouldQuery).toBe(true);expect(Object.keys(ui.state().tasks)).toHaveLength(0);expect(requests).toBe(1)
  }finally{ui.close()}
})
test('Stop aborts personalization immediately and late output cannot advance or replay on reopen',async()=>{
  const storage=uiStore();let calls=0,resolve!: (x:any)=>void,signal:AbortSignal|undefined
  const result=new Promise<any>(r=>{resolve=r});const requester=async(_facts:any,s:AbortSignal)=>{calls++;signal=s;return result}
  let ui=await open(false,false,false,100,40,true,storage,requester)
  try{
    await reachPersonalization(ui);ui.input.write('\r');await wait(()=>calls===1);ui.input.write('\x11');await wait(()=>ui.frame().includes('Saved intake is stopped'));expect(signal?.aborted).toBe(true)
    resolve({questions:bakeryQuestions});await Bun.sleep(50);expect(ui.frame()).toContain('Saved intake is stopped');expect(JSON.parse(ui.session.snapshot!.clarification!).status).toBe('requested')
    ui.close();ui=await open(true,false,false,100,40,true,storage,requester);await wait(()=>ui.frame().includes('New project'));ui.input.write('\x1b[B');await Bun.sleep(30);ui.input.write('\r');await wait(()=>ui.frame().includes('Open a saved intake'));ui.input.write('\r');await wait(()=>ui.frame().includes('Resume saved intake'));ui.input.write('\r');await wait(()=>ui.frame().includes('previous question request is unresolved'));expect(calls).toBe(1)
    ui.input.write('\x1b[B');await Bun.sleep(30);ui.input.write('\r');await wait(()=>ui.frame().includes('How many agents would you like?'));expect(calls).toBe(1)
  }finally{resolve({questions:[]});ui.close()}
})
test('provider failure keeps native answers and offers a manual continuation instead of looping',async()=>{
  let calls=0;const ui=await open(false,false,false,100,40,true,uiStore(),async()=>{calls++;throw new Error('fixture unavailable')})
  try{
    await reachPersonalization(ui);ui.input.write('\r');await wait(()=>ui.frame().includes('could not finish'));expect(ui.session.snapshot?.answers.idea).toBe('A bakery website');expect(calls).toBe(1)
    ui.input.write('\x1b[B');await Bun.sleep(30);ui.input.write('\r');await wait(()=>ui.frame().includes('How many agents would you like?'));expect(calls).toBe(1)
  }finally{ui.close()}
})

test('retrying an interrupted question-result save reuses the saved result without another model request',async()=>{
 const storage=uiStore(),save=storage.save.bind(storage);let failed=false,requests=0;const operations:string[]=[]
 storage.save=async input=>{if(input.origin==='application'){operations.push(input.operationId);if(!failed){failed=true;throw new Error('Fixture result save interrupted')}}return save(input)}
 const ui=await open(false,false,false,100,40,true,storage,async()=>{requests++;return {questions:bakeryQuestions}})
 try{
  await reachPersonalization(ui);ui.input.write('\r');await wait(()=>ui.frame().includes('Fixture result save interrupted'));expect(requests).toBe(1)
  ui.input.write('\x12');try{await wait(()=>ui.frame().includes(bakeryQuestions[0]!.question))}catch(error){console.error('RETRY STATE',JSON.stringify({frame:ui.frame(),snapshot:ui.session.snapshot,pending:ui.session.pending,operations,requests,history:ui.historySearches()}));throw error}expect(requests).toBe(1);expect(operations).toHaveLength(2);expect(operations[0]).toBe(operations[1])
 }finally{ui.close()}
})

test('a zero-gap model result automatically proceeds to agent count without filler questions',async()=>{
 let requests=0;const ui=await open(false,false,false,100,40,true,uiStore(),async()=>{requests++;return {questions:[]}})
 try{await reachPersonalization(ui);ui.input.write('\r');await wait(()=>ui.frame().includes('How many agents would you like?'));expect(requests).toBe(1);expect(JSON.parse(ui.session.snapshot!.clarification!).questions).toEqual([]);expect(ui.session.snapshot!.step).toBe(5)}finally{ui.close()}
})

test('New chat creates a native session without inheriting the current project hold',async()=>{
  setIntakeWorkHold('A saved project is stopped.','native-ui-fixture')
  config={...config,amirahcoActiveIntakeId:'11111111-1111-4111-8111-111111111111'}
  const ui=await open()
  try{
    await wait(()=>ui.frame().includes('New chat'))
    for(let i=0;i<4;i++){ui.input.write('\x1b[B');await Bun.sleep(35)}
    ui.input.write('\r');await wait(()=>ui.done())
    expect(ui.completion().options?.shouldQuery).toBe(false)
    expect(ui.completion().options?.submitNextInput).toBe(true)
    expect(ui.next()).toBe('/new')
    expect(intakeWorkHoldReason('fresh-chat-session')).toBeUndefined()
    expect(intakeWorkHoldReason('native-ui-fixture')).toContain('saved project')
    expect(await ui.storage.list()).toHaveLength(0)
    expect(Object.keys(ui.state().tasks)).toHaveLength(0)
  }finally{setIntakeWorkHold(undefined,'native-ui-fixture');ui.close()}
})

const uiPrd=()=>({title:'Bakery plan',summary:'A private menu for phone users',requirements:[{key:'R1',outcome:'Show a readable menu',scope:'required',priority:'high',exclusions:['No payments'],openQuestions:[],sourceFields:['needs'],criteria:[{key:'C1',description:'Owner reads the menu on a phone',method:'owner_review',blocking:true}]}],assumptions:[],openQuestions:[]})
async function savedPrdUI(requester:any,recoveredChange?:string){
  const storage=uiStore(),id='11111111-1111-4111-8111-111111111111'
  await storage.save({projectId:id,operationId:'22222222-2222-4222-8222-222222222222',sessionId:'ui-only-source',type:'save',expectedSequence:0,answers:{idea:'Bakery plan',needs:'No payments',success:'Readable on a phone',helpers:'1'},step:6,phase:'context_ready',create:true})
  const originalSave=storage.save.bind(storage)
  storage.save=async input=>{
    const previous=await storage.read(input.projectId).catch(()=>undefined),result=await originalSave(input)
    Object.assign(result,{prd:previous?.prd,prdRequest:previous?.prdRequest});return result
  }
  // Presentation fixture only. Real constraints/links/SQLite recovery are tested under Node.
  storage.prd=async request=>{
    const value=await storage.read(request.projectId)
    if(request.type==='prd_request')value.prdRequest={requestId:request.requestId,status:'requested',changeRequest:request.changeRequest||'',sourceDigest:'fixture'}
    else if(request.type==='prd_candidate'){
      value.prd={revision:(value.prd?.revision||0)+1,commitSequence:1,content:request.draft!,sourceDigest:'fixture',meaningHash:'a'.repeat(64),approved:false,stale:false,projectionPending:false,file:'/ui-only/PRD.md',activationCount:0,records:[]}
      value.prdRequest!.status='done'
    }else if(request.type==='prd_approve')value.prd!.approved=true
    return value
  }
  if(recoveredChange!==undefined)(await storage.read(id)).prdRequest={requestId:'33333333-3333-4333-8333-333333333333',status:'requested',sourceDigest:'fixture',changeRequest:recoveredChange}
  const ui=await open(false,false,false,100,40,false,storage,undefined,requester)
  await wait(()=>ui.frame().includes('New project'));ui.input.write('\x1b[B');await Bun.sleep(30);ui.input.write('\r')
  await wait(()=>ui.frame().includes('Open a saved intake'));ui.input.write('\r')
  await wait(()=>ui.frame().includes('Continue saved intake'));ui.input.write('\r')
  await wait(()=>ui.frame().includes('Review your project context'))
  for(let i=0;i<4;i++){ui.input.write('\x1b[B');await Bun.sleep(30)}
  ui.input.write('\r')
  return {ui,storage,id}
}
test('saved intake creates a PRD in native review; approval and revision never start work',async()=>{
  let calls=0
  const {ui,storage,id}=await savedPrdUI(async(_snapshot:any,change:string)=>{calls++;const draft=uiPrd();if(change)draft.summary='Menu and hours after owner change';return draft})
  try{
    await wait(()=>ui.frame().includes('Review PRD · revision 1'))
    expect(ui.frame()).toContain('Approve this PRD');expect(ui.done()).toBe(false);expect(calls).toBe(1)
    // Build precedes approval and is disabled until this revision is approved.
    ui.input.write('\x1b[B');await Bun.sleep(30);ui.input.write('\r');await wait(()=>ui.frame().includes('PRD approved — ready to Build'))
    expect((await storage.read(id)).prd?.approved).toBe(true)
    expect(ui.done()).toBe(false);expect(ui.next()).toBe('');expect(Object.keys(ui.state().tasks)).toHaveLength(0)
    ui.input.write('\x1b[B');await Bun.sleep(30);ui.input.write('\r')
    await wait(()=>ui.frame().includes('What should change?'));ui.input.write('Also show hours');ui.input.write('\r')
    await wait(()=>ui.frame().includes('Review PRD · revision 2'))
    expect(calls).toBe(2);expect((await storage.read(id)).prd?.approved).toBe(false)
  }finally{ui.close()}
})
test('Stop aborts pending PRD generation and discards late output',async()=>{
  let finish!:(value:any)=>void,signal:AbortSignal|undefined
  const {ui,storage,id}=await savedPrdUI(async(_snapshot:any,_change:string,active:AbortSignal)=>{signal=active;return new Promise(resolve=>{finish=resolve})})
  try{
    await wait(()=>Boolean(signal));ui.input.write('\x11')
    await wait(()=>ui.frame().includes('Saved intake is stopped'))
    expect(signal!.aborted).toBe(true);finish(uiPrd());await Bun.sleep(70)
    expect((await storage.read(id)).prd).toBeUndefined();expect((await storage.read(id)).stopped).toBe(true)
    expect(ui.done()).toBe(false)
  }finally{ui.close()}
})

test('reopened unfinished PRD request requires explicit generation and preserves saved owner change',async()=>{
  const changes:string[]=[]
  const {ui,storage,id}=await savedPrdUI(async(_snapshot:any,change:string)=>{changes.push(change);return uiPrd()},'Also show hours')
  try{
    await wait(()=>ui.frame().includes('A draft request is unfinished'));expect(changes).toEqual([])
    for(let index=0;index<3;index++){ui.input.write('\x1b[B');await Bun.sleep(30)}
    ui.input.write('\r')
    await wait(()=>ui.frame().includes('Review PRD · revision 1'))
    expect(changes).toEqual(['Also show hours']);expect((await storage.read(id)).prdRequest?.changeRequest).toBe('Also show hours');expect(ui.done()).toBe(false)
  }finally{ui.close()}
})
