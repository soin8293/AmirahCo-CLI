import {expect,test} from 'bun:test'
import {completeProjectContext,projectContext,recommendAgents} from './projectContext.js'
import start from './index.js'
import {createImmediateCommandContinuation,processSlashCommand} from '../../utils/processUserInput/processSlashCommand.js'
import {getDefaultAppState} from '../../state/AppStateStore.js'
import {normalizeMessagesForAPI} from '../../utils/messages.js'
import {call} from './start.js'

test('native command plumbing starts the next context turn with the confirmed brief and no extra user message',async()=>{
  const answers={idea:'Build a budget tracker',needs:'Import CSV, never upload bank data',success:'Categorized monthly totals',notes:'Use my notes later',helpers:'1'}
  const command={...start,load:async()=>({call:async(done:any)=>{completeProjectContext(answers,done,'/existing/workspace');return null}})}
  let state=getDefaultAppState()
  const context={options:{commands:[command],isNonInteractiveSession:false},getAppState:()=>state,setAppState:(update:any)=>{state=update(state)},messages:[]} as any
  const result=await processSlashCommand('/start',[],[],[],context,()=>{})
  expect(result.shouldQuery).toBe(true)
  const meta=result.messages.find(message=>message.type==='user'&&message.isMeta&&typeof message.message.content==='string'&&message.message.content.startsWith('AMIRAHCO project context'))
  expect(meta).toBeDefined()
  const payload=JSON.stringify(meta)
  expect(payload).toContain('Import CSV, never upload bank data')
  expect(payload).toContain('Categorized monthly totals')
  expect(payload).toContain('Use my notes later')
  expect(payload).toContain('does not authorize building')
  const nextRequest=normalizeMessagesForAPI(result.messages)
  expect(JSON.stringify(nextRequest)).toContain('Import CSV, never upload bank data')
  expect(JSON.stringify(nextRequest)).toContain('Continue the next context step NOW')
  expect(JSON.stringify(nextRequest)).toContain('do not implement, modify files')
  expect(JSON.stringify(nextRequest)).toContain('Do not repeat answered questions')
  expect(result.messages.filter(m=>m.type==='user'&&!m.isMeta)).toHaveLength(0)
  expect(Object.keys(state.tasks)).toHaveLength(0)
})

test('save-only remains local, and immediate completion carries one hidden native continuation',()=>{
  const facts={idea:'Bakery website',needs:'Menu and hours; no payments',success:'Read on a phone'}
  let saved:any,continued:any
  completeProjectContext(facts,(result,options)=>{saved={result,options}},'/existing','save')
  expect(saved.options.shouldQuery).toBe(false)
  expect(saved.options.metaMessages).toHaveLength(1)
  expect(createImmediateCommandContinuation(saved.result,saved.options)).toBeUndefined()
  completeProjectContext(facts,(result,options)=>{continued={result,options}},'/existing')
  const queued=createImmediateCommandContinuation(continued.result,continued.options)!
  expect(queued.isMeta).toBe(true);expect(queued.skipSlashCommands).toBe(true)
  expect(queued.allowInterruptionCorrection).toBe(false)
  expect(queued.value).toContain('Continue the next context step NOW')
  expect(String(queued.value).split('AMIRAHCO project context')).toHaveLength(2)
  expect(createImmediateCommandContinuation('Cancelled',undefined)).toBeUndefined()
})

test('agent suggestions reflect separate workstreams and ignore explicit non-goals',()=>{
  expect(recommendAgents({idea:'A bakery website',needs:'Show a menu; no payments or login',success:'Readable on a phone'}).count).toBe(1)
  expect(recommendAgents({idea:'A dashboard',needs:'API integration',success:'Customers can log in'}).count).toBe(2)
  const suggestion=recommendAgents({idea:'A mobile app',needs:'API and SQL database',success:'Sync data'})
  expect(suggestion.count).toBe(3)
  expect(suggestion.reason).toContain('interface, services/integrations, data')
  let output=''
  completeProjectContext({idea:'A mobile app',needs:'API and SQL database',success:'Sync data',helpers:'7'},(_,options)=>{output=options!.metaMessages![0]!},'/existing')
  expect(output).toContain('"requestedAgents": 7')
  expect(output).toContain('"agentRecommendation"')
})

test('native dispatcher reserves a pinned form rather than covering the scrollable artwork',async()=>{
  let finish:any,shown:any
  const command={...start,load:async()=>({call:async(done:any)=>{finish=done;return call(done)}})}
  let state=getDefaultAppState()
  const context={options:{commands:[command],isNonInteractiveSession:false},getAppState:()=>state,setAppState:(update:any)=>{state=update(state)},messages:[]} as any
  const pending=processSlashCommand('/start',[],[],[],context,options=>{shown=options})
  try{
    for(let attempt=0;attempt<100&&!shown;attempt++)await Bun.sleep(10)
    expect(shown?.dialogLayout).toBe('docked')
    expect(shown?.isImmediate).toBe(true)
    expect(shown?.shouldHidePromptInput).toBe(true)
  }finally{finish?.()}
  expect((await pending).shouldQuery).toBe(false)
})

test('project name is a review suggestion, not a copied answer in the next input',()=>{
  const answers={idea:'I want to build a bakery website',needs:'List prices',success:'Customers find opening hours',helpers:'3'}
  const context=projectContext(answers,'/existing')
  expect(context.name).toBe('a bakery website')
  expect(context.requestedAgents).toBe(3)
  expect(context.currentWorkspace).toBe('/existing')
  expect(answers).not.toHaveProperty('name')
  expect(answers).not.toHaveProperty('folder')
})

test('invalid or cancelled edits cannot inject incomplete context',()=>{
  let deliveries=0
  const valid={idea:'Budget tracker',needs:'CSV import',success:'Monthly totals',helpers:'1'}
  for(const helpers of ['', '0', '-2', '1.5', 'two']){
    expect(()=>completeProjectContext({...valid,helpers},()=>{deliveries++},'/existing')).toThrow()
  }
  expect(()=>completeProjectContext({...valid,idea:' '},()=>{deliveries++},'/existing')).toThrow()
  expect(deliveries).toBe(0)
})
