import {TesterAccessSetup} from '../../components/TesterAccessSetup.js'
import React,{createContext,useContext,useEffect,useRef,useState} from 'react'
import {randomUUID} from 'node:crypto'
import {clarificationInputHash,clarificationPrompt,currentClarification,parseClarification,clarificationState,type ClarificationState,type PersonalizedRequester} from './clarification.js'
import {requestPersonalizedQuestions} from './personalizedQuestions.js'
import {QuestionLoading} from './QuestionLoading.js'
import {clarificationFailureMessage} from './clarification.js'
import {requestPrd} from './prd.js'
import {prdDraft,prdPrompt,type PrdRequester} from './prdContract.js'
import {Box,Text,useInput} from '../../ink.js'
import {Select} from '../../components/CustomSelect/index.js'
import TextInput from '../../components/TextInput.js'
import {WizardProvider,useWizard} from '../../components/wizard/index.js'
import {useTerminalSize} from '../../hooks/useTerminalSize.js'
import type {LocalJSXCommandOnDone} from '../../types/command.js'
import ScrollBox,{type ScrollBoxHandle} from '../../ink/components/ScrollBox.js'
import {ScrollKeybindingHandler} from '../../components/ScrollKeybindingHandler.js'
import {useSetAppState} from '../../state/AppState.js'
import {exitTeammateView} from '../../state/teammateViewHelpers.js'
import {approvedBuildAutonomy,completeProjectContext,contextSummary,projectContext,projectContextError,recommendAgents} from './projectContext.js'
import {getGlobalConfig,saveGlobalConfig} from '../../utils/config.js'
import {getSessionId} from '../../bootstrap/state.js'
import reconciler from '../../ink/reconciler.js'
import {useRegisterKeybindingContext} from '../../keybindings/KeybindingContext.js'
import {useKeybindings} from '../../keybindings/useKeybinding.js'
import {useShortcutDisplay} from '../../keybindings/useShortcutDisplay.js'
import {IntakeStore,NativeIntakeSession,intakeStateRoot,intakeAnswers,setIntakeWorkHold,type IntakeSnapshot} from '../../services/projectRecords/intakeStore.js'
import {starterCapabilityProfileDigest} from '../../services/projectRecords/integrationContract.js'
import {admitFoundry,bindFoundryActivation} from '../../services/projectRecords/foundryBridge.js'
import {getBundledWorkflowPaths} from '../../services/projectRecords/workflowPaths.js'
import {resolveWorkflowPython,runtimeCommand} from '../../services/projectRecords/workflowRuntime.js'

const Done=createContext<LocalJSXCommandOnDone>(()=>{})
const STEP={access:14,home:0,idea:1,needs:2,success:3,notes:4,helpers:5,review:6,edit:7,name:8,folder:9,projects:10,recovery:11,clarification:12,prd:13}
type SessionUI={session:NativeIntakeSession;busy:boolean;error:string;status:string;permissionMode:string;model:string;requester:PersonalizedRequester;prdRequester:PrdRequester;abortAI:{current:AbortController|null};receivedStop:()=>void;run:(work:()=>Promise<IntakeSnapshot>,after:()=>void)=>Promise<void>;retry:()=>void;reset:()=>void}
const Session=createContext<SessionUI>(null!)
function answers(data:Record<string,unknown>){return intakeAnswers.parse(Object.fromEntries(['idea','needs','success','notes','helpers','name','folder'].filter(key=>data[key]!==undefined).map(key=>[key,data[key]])))}
function DraftStatus(){
  const state=useContext(Session),wizard=useWizard()
  useRegisterKeybindingContext('Intake',true)
  const stopKey=useShortcutDisplay('intake:stop','Intake','Ctrl+Q')
  const retryKey=useShortcutDisplay('intake:retry','Intake','Ctrl+R')
  useKeybindings({
    'intake:stop':()=>{
      if(!state.session.started)return
      state.abortAI.current?.abort()
      state.receivedStop()
      // Stop does not pretend that the current unsubmitted field was saved.
      void state.run(()=>state.session.stop(state.session.snapshot?.answers||{},state.session.snapshot?.step||1),()=>wizard.goToStep(STEP.recovery))
    },
    'intake:retry':()=>{if(state.error)state.retry()},
  },{context:'Intake'})
  return <Box flexDirection="column">{state.status&&<Text dimColor>{state.status}</Text>}{state.error&&<Text color="error">{state.error} · {retryKey} retry original save</Text>}<Text dimColor>{state.busy?'Saving locally… Stop remains available.':`${stopKey} stop · Enter ${wizard.currentStepIndex===STEP.prd?'select':'saves answers'}`}</Text></Box>
}
function Guide({onDone,provided,requester,prdRequester,permissionMode,model}:{onDone:LocalJSXCommandOnDone;provided?:NativeIntakeSession;requester:PersonalizedRequester;prdRequester:PrdRequester;permissionMode:string;model:string}){
  const abortAI=useRef<AbortController|null>(null)
  const [session]=useState(()=>{
    return provided||new NativeIntakeSession(new IntakeStore(intakeStateRoot()),getSessionId())
  })
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('')
  const retryWork=useRef<()=>Promise<void>>(()=>Promise.resolve())
  const run=async(work:()=>Promise<IntakeSnapshot>,after:()=>void)=>{
    setBusy(true);setError('')
    try{
      const saved=await work()
      let shortcut=true
      try{saveGlobalConfig(previous=>({...previous,amirahcoActiveIntakeId:saved.projectId}));shortcut=getGlobalConfig().amirahcoActiveIntakeId===saved.projectId}catch{shortcut=false}
      const control=saved.stopped?' · STOPPED (saved)':session.hasExplicitStop?' · Stop received; capture pending':''
      setStatus(`Saved locally · revision ${saved.sequence}${control}${shortcut?'':' · Reopen with Open saved project; home shortcut unavailable'}`)
      if(saved.projectionPending||saved.prd?.projectionPending){retryWork.current=()=>run(()=>session.repair(),after);setError('Records saved; the readable document is awaiting repair. Original files are preserved.');return}
      // Native keyboard handlers must commit with the step after an async save.
      reconciler.flushSyncFromReconciler(()=>{setBusy(false);after()})
    }catch(failure){
      retryWork.current=()=>run(()=>session.pending?session.retry():work(),after)
      reconciler.flushSyncFromReconciler(()=>{setError(failure instanceof Error?failure.message:'Save unavailable. Current input remains unsaved.');setBusy(false)})
    }finally{setBusy(false)}
  }
  useEffect(()=>()=>{abortAI.current?.abort();void session.store.close()},[session])
  return <Session.Provider value={{session,busy,error,status,permissionMode,model,requester,prdRequester,abortAI,receivedStop:()=>setStatus('Stop received · capture pending; not yet saved'),run,retry:()=>{void retryWork.current()},reset:()=>{abortAI.current?.abort();session.newDraft();setStatus('');setError('')}}}><Done.Provider value={onDone}><WizardProvider steps={STEPS} initialData={{}} onComplete={()=>onDone()} onCancel={()=>onDone()} title="AMIRAHCO CLI" showStepCounter={false}/></Done.Provider></Session.Provider>
}
function Options({title,help,options,select,back,visibleOptionCount=5}:{title:string;help?:string;options:{value:string;label:string;description?:string;disabled?:boolean}[];select:(value:string)=>void;back?:()=>void;visibleOptionCount?:number}){
  const wizard=useWizard()
  const [focused,setFocused]=useState(()=>options[0]?.value)
  useEffect(()=>{if(!options.some(option=>option.value===focused))setFocused(options[0]?.value)},[options,focused])
  useInput((input,key,event)=>{
    const move=key.downArrow||(key.ctrl&&input==='n')||input==='j'?1:key.upArrow||(key.ctrl&&input==='p')||input==='k'?-1:0
    if(move&&options.length){
      setFocused(currentValue=>{
        const current=Math.max(0,options.findIndex(option=>option.value===currentValue))
        return options[(current+move+options.length)%options.length]?.value
      })
      event.stopImmediatePropagation();return
    }
    if(key.return&&focused&&!options.find(option=>option.value===focused)?.disabled){select(focused);event.stopImmediatePropagation();return}
    if(key.escape){(back||wizard.goBack)();event.stopImmediatePropagation()}
  })
  return <Box flexDirection="column"><Text bold>{title}</Text>{help&&<Text>{help}</Text>}<Select key={focused} options={options} defaultFocusValue={focused} visibleOptionCount={visibleOptionCount} hideIndexes={true} inlineDescriptions={true} isNavigationDisabled={true}/><Text dimColor>↑/↓ choose · Enter select · Esc back</Text></Box>
}
function Home(){
  const wizard=useWizard();const done=useContext(Done);const [notice]=useState('');const state=useContext(Session)
  return <Options title="What would you like to do?" visibleOptionCount={6} help={wizard.wizardData.testerConnected?'Tester key saved. Choose a chat or project.':notice||'Start something new or reopen saved work.'} options={[{value:'new',label:'New project',description:'Guided setup, PRD, and project work'},{value:'open',label:'Open saved project',description:'Continue setup or PRD review'},{value:'history',label:'Session history',description:'Reopen a previous chat or project'},{value:'settings',label:'Settings',description:'Models, permissions, and preferences'},{value:'chat',label:'New chat',description:'Start chatting immediately'},{value:'api',label:'Add API key',description:'Set up or change your AI access'}]} select={value=>{
    if(state.busy)return
    if(value==='new'){state.reset();wizard.setWizardData({editing:false});wizard.goToStep(STEP.idea)}
    else if(value==='open')wizard.goToStep(STEP.projects)
    else if(value==='chat')done(undefined,{nextInput:'/new',submitNextInput:true,shouldQuery:false})
    else if(value==='settings')done(undefined,{nextInput:'/config',submitNextInput:true})
    else if(value==='api')wizard.goToStep(STEP.access)
    else done(undefined,{nextInput:'/resume --all',submitNextInput:true})
  }}/>
}
function Answer({name,title,help,optional=false}:{name:string;title:string;help:string;optional?:boolean}){
  const wizard=useWizard();const {columns}=useTerminalSize();const state=useContext(Session)
  const value=String(wizard.wizardData[name]??'');const [cursor,setCursor]=useState(value.length);const [error,setError]=useState('')
  useInput((_,key,event)=>{if(key.escape){wizard.goBack();event.stopImmediatePropagation()}})
  return <Box flexDirection="column"><Text bold>{title}</Text><Text>{help}</Text><Box borderStyle="round" paddingX={1} borderColor="success"><TextInput key={name} value={value} onChange={text=>wizard.updateWizardData({[name]:text})} cursorOffset={cursor} onChangeCursorOffset={setCursor} columns={Math.max(10,columns-8)} maxVisibleLines={2} multiline={true} focus={true} showCursor={true} disableEscapeDoublePress={true} onSubmit={text=>{
    if(state.busy)return
    const answer=text.trim();if(!answer&&!optional){setError('Please add an answer, or press Esc to go back.');return}
    if(name==='helpers'&&(!/^[1-9]\d*$/.test(answer)||!Number.isSafeInteger(Number(answer)))){setError('Enter a whole number starting at one.');return}
    const updates:Record<string,unknown>={[name]:name==='helpers'?answer:text}
    wizard.updateWizardData(updates)
    const next=wizard.wizardData.editing?STEP.review:name==='notes'?STEP.clarification:wizard.currentStepIndex+1
    void state.run(()=>state.session.save(answers({...wizard.wizardData,...updates}),next,next===STEP.review?'review':'intake'),()=>{if(state.session.isStopped||state.session.snapshot?.stopped)wizard.goToStep(STEP.recovery);else wizard.goToStep(next)})
  }}/></Box>{error&&<Text color="error">{error}</Text>}<Text dimColor>Enter continue · Shift+Enter new line · Esc back</Text></Box>
}
function Idea(){return <Answer name="idea" title="What would you like to make?" help="For example: a bakery website or budget tracker. These answers become context for your lead agent."/>}
function Name(){const wizard=useWizard();return <Answer name="name" title="Project name" help={`Suggested: ${projectContext(wizard.wizardData).name}. Leave blank to keep the suggestion.`} optional={true}/>}
function Folder(){const wizard=useWizard();return <Answer name="folder" title="Planned project folder" help={`Suggested: ${projectContext(wizard.wizardData).plannedFolder}. No folder is created. Leave blank to keep it.`} optional={true}/>}
function Helpers(){
  const wizard=useWizard();const [custom,setCustom]=useState(false);const state=useContext(Session)
  const suggestion=recommendAgents(wizard.wizardData)
  if(custom)return <Answer name="helpers" title="How many agents?" help="Enter a whole number starting at one, including the lead. The team starts later."/>
  const counts=[suggestion.count,...[1,2,3].filter(count=>count!==suggestion.count)]
  return <Options title="How many agents would you like?" help={`${suggestion.reason} Total includes the lead. You choose; the team starts later.`} options={counts.map((count,index)=>({value:String(count),label:`${count} ${count===1?'agent':'agents'}${index===0?' (Recommended)':''}`})).concat([{value:'custom',label:'Choose another number'}])} select={value=>{if(state.busy)return;if(value==='custom')setCustom(true);else{wizard.updateWizardData({helpers:value});void state.run(()=>state.session.save(answers({...wizard.wizardData,helpers:value}),STEP.review,'review'),()=>wizard.goToStep((state.session.isStopped||state.session.snapshot?.stopped)?STEP.recovery:STEP.review))}}}/>
}
function Needs(){return <Answer name="needs" title="What should it do?" help="Describe the important features, constraints, and anything it should avoid."/>}
function Success(){return <Answer name="success" title="What would a successful result look like?" help="What should you be able to do when it is finished?"/>}
function Notes(){return <Answer name="notes" title="Any documents or notes?" help="Optional. Mentioned files stay unopened. Next: a few personalized questions or review without AI." optional={true}/>}
function Review(){
  const wizard=useWizard();const done=useContext(Done);const data=wizard.wizardData
  const setAppState=useSetAppState()
  const scroll=useRef<ScrollBoxHandle>(null)
  const submitted=useRef(false)
  const error=projectContextError(data)
  const state=useContext(Session)
  return <Box flexDirection="column"><Text bold>Review your project context</Text><ScrollKeybindingHandler scrollRef={scroll} isActive={true}/><ScrollBox ref={scroll} height={3} flexDirection="column"><Text>{contextSummary(data)}</Text></ScrollBox><Text color={error?'error':undefined}>{error||'Continue with the lead to review context and resolve remaining gaps. Building comes later.'}</Text><Options title="Next" options={[{value:'use',label:'Continue context with AI',disabled:Boolean(error)},{value:'edit',label:'Edit answers or project details'},{value:'save',label:'Save context only',disabled:Boolean(error)},{value:'home',label:'Back to home'},{value:'prd',label:'Create or review PRD',disabled:Boolean(error)}]} select={value=>{
      if(state.busy)return
    if(value==='edit')wizard.goToStep(STEP.edit)
    else if(value==='home')wizard.goToStep(STEP.home)
    else if(value==='prd'&&!error){void state.run(()=>state.session.save(answers(data),STEP.review,'context_ready',typeof data.clarification==='string'?data.clarification:undefined),()=>{if(state.session.isStopped){wizard.goToStep(STEP.recovery);return}wizard.updateWizardData({generatePrd:!state.session.snapshot?.prdRequest});wizard.goToStep(STEP.prd)})}
    else if(!error&&!submitted.current){void state.run(()=>state.session.save(answers(data),STEP.review,'context_ready',typeof data.clarification==='string'?data.clarification:undefined),()=>{if(state.session.isStopped||state.session.snapshot?.stopped){wizard.goToStep(STEP.recovery);return}submitted.current=true;exitTeammateView(setAppState);completeProjectContext(data,done,undefined,value==='save'?'save':'continue')})}
  }}/></Box>
}
function EditDetails(){
  const wizard=useWizard()
  const choices=[['idea','Idea'],['needs','Features and constraints'],['success','Success criteria'],['notes','Notes'],['name','Project name'],['folder','Planned folder'],['helpers','Agent count'],['clarification','Personalized answers'],['review','Back to review']]
  return <Options title="What would you like to change?" options={choices.map(([value,label])=>({value:value!,label:label!}))} select={value=>{wizard.updateWizardData({editing:true,...(value==='clarification'?{clarificationIndex:0}:{})});wizard.goToStep(STEP[value as keyof typeof STEP])}}/>
}
function Projects(){
  const state=useContext(Session),wizard=useWizard();const [items,setItems]=useState<IntakeSnapshot[]>([]),[offset,setOffset]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true)
  useEffect(()=>{let live=true;setLoading(true);void state.session.store.list(offset).then(rows=>{if(live)reconciler.flushSyncFromReconciler(()=>{setItems(rows);setLoading(false)})}).catch(()=>{if(live)reconciler.flushSyncFromReconciler(()=>{setError('Saved intake list is unavailable. No empty replacement was created.');setLoading(false)})});return()=>{live=false}},[state.session,offset])
  if(loading)return <Text>Reading local saved intakes…</Text>
  return <Options title="Open a saved intake" help={error||(!items.length?'No saved intakes on this page. New project starts from the home menu.':'Choose the project to reopen. Unsaved keystrokes are not recovered.')} options={[...items.map(item=>({value:item.projectId,label:`${item.unavailable?'Unavailable intake':String(item.answers.name||item.answers.idea||'Untitled intake').slice(0,38)} · ${item.projectId.slice(0,8)}${item.stopped?' · stopped':''}`,disabled:item.unavailable})),...(items.length===200?[{value:'next',label:'Next page'}]:[]),...(offset?[{value:'previous',label:'Previous page'}]:[]),{value:'home',label:'Back to home'}]} select={value=>{if(state.busy)return;if(value==='home')wizard.goToStep(STEP.home);else if(value==='next')setOffset(offset+200);else if(value==='previous')setOffset(Math.max(0,offset-200));else void state.run(()=>state.session.open(value),()=>wizard.goToStep(STEP.recovery))}}/>
}
function Recovery(){
  const state=useContext(Session),wizard=useWizard(),saved=state.session.snapshot
  return <Options title={saved?.stopped?'Saved intake is stopped':'Continue saved intake'} help="Only saved answers are available. Unsaved input may be missing. This continues intake only; no inference, build or team starts." options={[{value:'resume',label:saved?.stopped?'Resume saved intake':'Continue saved answers',disabled:!saved},{value:'pause',label:'Keep paused and return home'}]} select={value=>{
    if(state.busy)return
    if(value==='pause')wizard.goToStep(STEP.home)
    else void state.run(()=>state.session.resume(),()=>{if(state.session.isStopped)return;const current=state.session.snapshot!;wizard.setWizardData({...current.answers,clarification:current.clarification,editing:false});wizard.goToStep(current.phase==='context_ready'?STEP.review:current.step)})
  }}/>
}
function Personalized(){
  const wizard=useWizard(),state=useContext(Session),data=wizard.wizardData
  const stored=parseClarification(data.clarification),current=currentClarification(data)
  const [pending,setPending]=useState(false),[problem,setProblem]=useState('')
  const started=useRef<string|null>(null)
  useEffect(()=>()=>{state.abortAI.current?.abort()},[state.abortAI])
  const next=()=>{if(state.session.isStopped)wizard.goToStep(STEP.recovery);else wizard.goToStep(data.editing?STEP.review:STEP.helpers)}
  const persist=(value:ClarificationState,after:()=>void,origin:'owner'|'application'='owner',step=STEP.clarification)=>{
    const serialized=JSON.stringify(clarificationState.parse(value))
    return state.run(()=>state.session.save(answers(data),step,'intake',serialized,origin),()=>{wizard.updateWizardData({clarification:serialized});if(state.session.isStopped)wizard.goToStep(STEP.recovery);else after()})
  }
  const begin=()=>{
    if(pending||state.busy||state.session.isStopped)return
    try{clarificationPrompt(data)}catch(error){setProblem(error instanceof Error?error.message:'Intake cannot be sent.');return}
    const requestId=randomUUID(),inputHash=clarificationInputHash(data)
    const value:ClarificationState={version:1,inputHash,status:'requested',attempts:(stored?.attempts||0)+1,requestId,questions:[],responses:{}}
    const controller=new AbortController();state.abortAI.current=controller
    void persist(value,()=>{
      if(started.current===requestId||controller.signal.aborted||state.session.isStopped)return
      started.current=requestId;setPending(true);setProblem('')
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])
      const mayIssue=()=>!signal.aborted&&!state.session.isStopped
      void state.requester(data,signal,mayIssue).then(result=>{
        if(!mayIssue())return
        const ready:ClarificationState={...value,status:result.questions.length?'ready':'done',questions:result.questions,...(result.responseId?{responseId:result.responseId}:{})}
        void persist(ready,()=>{wizard.updateWizardData({clarificationIndex:0});if(!result.questions.length)next()},'application',result.questions.length?STEP.clarification:data.editing?STEP.review:STEP.helpers)
      }).catch((failure:unknown)=>{
        if(controller.signal.aborted||state.session.isStopped)return
        setProblem(`${clarificationFailureMessage(failure)} Your saved answers are intact.`)
        void persist({...value,status:'held'},()=>{},'application')
      }).finally(()=>{setPending(false)})
    })
  }
  const skip=()=>{if(pending||state.busy)return;void persist({version:1,inputHash:clarificationInputHash(data),status:'skipped',attempts:stored?.attempts||0,questions:[],responses:{}},next,'owner',data.editing?STEP.review:STEP.helpers)}
  const index=typeof data.clarificationIndex==='number'?data.clarificationIndex:current?.questions.findIndex(q=>!(q.intent in current.responses))??0
  const selected=current?.questions[index]
  if(current&&(current.status==='ready'||current.status==='done')&&selected)return <PersonalizedAnswer key={selected.intent} value={current} index={index} save={value=>{const last=index+1>=value.questions.length;void persist({...value,status:last?'done':'ready'},()=>{wizard.updateWizardData({clarificationIndex:index+1});if(last)next()},'owner',last?(data.editing?STEP.review:STEP.helpers):STEP.clarification)}}/>
  const held=stored?.status==='requested'
  if(pending)return <Box flexDirection="column"><Text bold>Finding useful questions for your project…</Text><QuestionLoading/></Box>
  return <Options title={pending?'Finding useful questions for your project…':'Personalized questions'} help={problem||(pending?'Using your configured model for one short, tool-free request. Ctrl+Q stops it.':held?'A previous question request is unresolved. It will not be replayed on reopen. Your saved answers are available below.':current?.status==='done'?'Your earlier personalized answers are saved.':stored&&!current?'Your intake changed. Earlier questions remain in history; they are not reused as current facts.':'Ask up to three questions based on your idea and missing details. This uses your configured AI; it does not build anything.')} options={[{value:'ai',label:'Personalize questions with AI',disabled:pending||held||current?.status==='done'||(stored?.attempts||0)>=2},{value:'continue',label:current?.status==='done'?'Continue with saved answers':'Continue without AI',disabled:pending},{value:'back',label:'Back to starter answers',disabled:pending}]} select={choice=>{if(state.busy||pending)return;if(choice==='ai')begin();else if(choice==='back')wizard.goToStep(STEP.notes);else if(current?.status==='done')next();else skip()}}/>
}
function PersonalizedAnswer({value,index,save}:{value:ClarificationState;index:number;save:(value:ClarificationState)=>void}){
  const state=useContext(Session),wizard=useWizard(),{columns}=useTerminalSize(),q=value.questions[index]!
  const [text,setText]=useState(value.responses[q.intent]??''),[cursor,setCursor]=useState(text.length),[error,setError]=useState('')
  useInput((_,key,event)=>{if(key.escape){wizard.goToStep(STEP.notes);event.stopImmediatePropagation()}})
  return <Box flexDirection="column"><Text bold>For your project · {index+1}/{value.questions.length}</Text><Text bold>{q.question}</Text><Text>{q.why}</Text><Box borderStyle="round" paddingX={1} borderColor="success"><TextInput value={text} onChange={setText} cursorOffset={cursor} onChangeCursorOffset={setCursor} columns={Math.max(10,columns-8)} maxVisibleLines={2} multiline={true} focus={true} showCursor={true} disableEscapeDoublePress={true} onSubmit={answer=>{if(state.busy)return;try{save(clarificationState.parse({...value,responses:{...value.responses,[q.intent]:answer}}))}catch{setError('Keep this answer within 4 KiB. Your text has not been truncated.')}}}/></Box>{error&&<Text color="error">{error}</Text>}<Text dimColor>Enter saves and continues · Leave blank or write “not sure” to defer · Esc back</Text></Box>
}
function PrdReview(){
  const state=useContext(Session),wizard=useWizard(),done=useContext(Done),{rows,columns}=useTerminalSize()
  const [pending,setPending]=useState(false),[problem,setProblem]=useState(''),[editing,setEditing]=useState(false)
  const [change,setChange]=useState(()=>state.session.snapshot?.prdRequest?.status==='requested'?state.session.snapshot.prdRequest.changeRequest:''),[cursor,setCursor]=useState(0)
  const scroll=useRef<ScrollBoxHandle>(null),entered=useRef(false)
  const snapshot=state.session.snapshot,prd=snapshot?.prd
  useInput((_,key,event)=>{if(key.escape&&editing){setEditing(false);event.stopImmediatePropagation()}})
  useEffect(()=>()=>{state.abortAI.current?.abort()},[state.abortAI])
  function generate(instruction:string){
    if(state.busy||pending||state.session.isStopped||!state.session.snapshot)return
    const base=state.session.snapshot
    try{prdPrompt(base,instruction)}catch(error){setProblem(error instanceof Error?error.message:'PRD input unavailable.');return}
    const requestId=randomUUID(),controller=new AbortController()
    state.abortAI.current=controller;setProblem('')
    void state.run(()=>state.session.prd('prd_request',requestId,instruction),()=>{
      if(controller.signal.aborted||state.session.isStopped||state.session.snapshot?.prdRequest?.requestId!==requestId)return
      setPending(true);setEditing(false)
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])
      const mayIssue=()=>!signal.aborted&&!state.session.isStopped&&state.session.snapshot?.prdRequest?.requestId===requestId
      void state.prdRequester(base,instruction,signal,mayIssue).then(value=>{
        if(!mayIssue())return
        const candidate=prdDraft.parse(value)
        void state.run(()=>state.session.prd('prd_candidate',requestId,undefined,candidate),()=>{setChange('');setCursor(0);scroll.current?.scrollTo(0)})
      }).catch((failure:unknown)=>{
        if(!controller.signal.aborted&&!state.session.isStopped)setProblem(`${clarificationFailureMessage(failure).replaceAll('questions','the PRD')} Saved answers and earlier drafts are intact. Generate a new draft to retry explicitly.`)
      }).finally(()=>{setPending(false)})
    })
  }
  useEffect(()=>{
    if(entered.current)return
    entered.current=true
    if(wizard.wizardData.generatePrd){wizard.updateWizardData({generatePrd:false});generate('')}
  },[])
  const blocked=state.busy||pending||state.session.isStopped||Boolean(snapshot?.stopped)
  const material=Boolean(prd?.content.openQuestions.length||prd?.content.requirements.some(r=>r.openQuestions.length))
  const status=pending?'Creating your PRD…':snapshot?.prdRequest?.status==='requested'?'A draft request is unfinished':!prd?'Create your PRD':prd.stale?'Your saved answers changed — update this PRD':prd.projectionPending?'PRD saved; document repair needed':snapshot?.activation?'Build activated — reopen the same project run':prd.approved?'PRD approved — ready to Build':`Review PRD · revision ${prd.revision}`
  const lines=prd?[
    prd.content.title,prd.content.summary,'',...prd.content.requirements.flatMap(r=>[
      `${r.key} [${r.scope}; ${r.priority}] ${r.outcome}`,`  Owner sources: ${r.sourceFields.join(', ')}`,...r.exclusions.map(x=>`  Excluded: ${x}`),...r.criteria.map(c=>`  ${r.key}-${c.key}: ${c.description} (${c.method}; ${c.blocking?'blocking':'nonblocking'}; not performed)`),...r.openQuestions.map(x=>`  Open question: ${x}`),'',
    ]),'Proposed assumptions',...(prd.content.assumptions.length?prd.content.assumptions:['None recorded.']),'','Material open questions',...(prd.content.openQuestions.length?prd.content.openQuestions:['None recorded.']),'','Applied owner changes',...(prd.ownerChanges?.length?prd.ownerChanges:['None recorded.']),'','Saved owner input',...Object.entries(snapshot!.answers).map(([key,value])=>`${key}: ${value}`),...(snapshot!.clarification?[`Personalized questions and responses: ${snapshot!.clarification}`]:[]),...(snapshot!.prdRequest?.changeRequest?[`Your revision request: ${snapshot.prdRequest.changeRequest}`]:[]),'',`PRD.md: ${prd.file}`,'Referenced files and URLs were not opened during this tool-free drafting step.',
  ].join('\n'):'Your saved answers become a proposed PRD and database records. You will review and approve its current revision before any later Start action. Creating a draft uses your configured AI.'
  return <Box flexDirection="column"><Text bold>{status}</Text><ScrollKeybindingHandler scrollRef={scroll} isActive={true}/><ScrollBox ref={scroll} height={Math.max(3,Math.min(12,rows-19))} flexDirection="column"><Text>{lines}</Text></ScrollBox>
    {problem&&<Text color="error">{problem}</Text>}
    {!pending&&snapshot?.prdRequest?.status==='requested'&&<Text>A previous request is unfinished. It will not replay automatically. Generate a new draft sends a new AI request.</Text>}
    {material&&<Text>Resolve the open questions before approval. Use Request changes to supply the missing answers.</Text>}
    {editing?<Box flexDirection="column"><Text>What should change? Include answers to any open questions.</Text><TextInput value={change} onChange={setChange} cursorOffset={cursor} onChangeCursorOffset={setCursor} columns={Math.max(10,columns-8)} maxVisibleLines={3} multiline={true} focus={true} showCursor={true} disableEscapeDoublePress={true} onSubmit={value=>{if(!value.trim()){setProblem('Describe the change before sending it.');return}if(Buffer.byteLength(value,'utf8')>4096){setProblem('Keep the change request within 4 KiB. Your text has not been truncated.');return}generate(value)}}/></Box>:<Options title="PRD actions" back={()=>wizard.goToStep(STEP.review)} help="Approval records this exact revision only. Build is the separate action that activates and continues immediately." options={[
      {value:'build',label:snapshot?.activation?'Continue this build':'Build this project',disabled:blocked||!prd?.approved||prd.stale||prd.projectionPending},
      {value:'approve',label:'Approve this PRD',disabled:blocked||!prd||prd.stale||prd.projectionPending||material||prd.approved||snapshot?.prdRequest?.status!=='done'},
      {value:'edit',label:'Request changes',disabled:blocked||!prd},
      {value:'generate',label:prd||snapshot?.prdRequest?'Generate a new draft':'Create PRD for review',disabled:blocked},
      {value:'repair',label:'Repair saved document',disabled:blocked||!prd?.projectionPending},
      {value:'back',label:'Back to saved context',disabled:blocked},
    ]} select={value=>{
      if(blocked)return
      if(value==='build'&&prd?.approved){
        const handoff=async(saved:IntakeSnapshot)=>{
          const activation=saved.activation
          if(!activation){setProblem('Activation was not saved. Reopen this project and retry the same Build action.');return}
          try{
            const mayIssue=async()=>{
              if(state.session.isStopped||state.session.snapshot?.stopped)return false
              const current=await state.session.store.read(saved.projectId)
              return !current.stopped&&!current.projectionPending&&!current.prd?.stale&&!current.prd?.projectionPending&&current.prd?.approved===true&&current.activation?.activationId===activation.activationId&&current.prd.revision===activation.planRevision&&current.prd.meaningHash===activation.meaningHash
            }
            const python=await resolveWorkflowPython()
            const binding=await bindFoundryActivation(state.session.store,saved,mayIssue)
            if(state.session.isStopped||state.session.snapshot?.stopped){setProblem('Stop is active. The activation and Foundry run are saved at admission; no work was dispatched.');return}
            const controlRef=`activation:${activation.activationId}@${activation.revision}`
            const workflow=getBundledWorkflowPaths()
            if(!workflow)throw new Error('Packaged workflow entrypoint is unavailable; activation is retained.')
            const admitted=binding.inspection.run.current_node==='admission'&&binding.inspection.run.status==='ready'?await admitFoundry(binding,controlRef,state.permissionMode,activation.nativeSessionId,state.model,mayIssue):binding.inspection.run
            if(!await mayIssue()){setProblem('Stop or a project change holds this build. Reopen the same saved activation; no native work was dispatched.');return}
            if(!['work','review','repair','complete','stopped','blocked'].includes(admitted.current_node))throw new Error('Foundry did not reach a recoverable project obligation.')
            const packet=['AMIRAHCO Build activation and native admission accepted. Continue immediately in this same native session; do not ask the owner to type start or repeat intake.',`Project: ${saved.projectId}`,`Activation: ${activation.activationId}@${activation.revision}`,`PRD: revision ${activation.planRevision}; meaning ${activation.meaningHash}`,`Context packet: ${activation.contextPacketId}@${activation.contextPacketRevision}; digest ${activation.contextDigest}`,`Selected total: ${activation.selectedTotal} including the current lead. Create exactly ${Math.max(0,activation.selectedTotal-1)} native teammate(s); create no hidden reviewer or assistant lead.`,`Workspace binding: ${activation.workspaceRoot}`,`Capability profile: ${activation.capabilityProfileDigest}`,`Foundry database: ${binding.db}`,`Foundry run: ${binding.runId}; revision ${admitted.revision}; current obligation ${admitted.current_node}`,`Native session registered: ${activation.nativeSessionId}; model ${state.model}; permission state observed at admission ${state.permissionMode}`,approvedBuildAutonomy(activation.selectedTotal),'Treat these as immutable references to separate app, Foundry and native authorities. Invoke the packaged amirahco-context and amirahco-work skills through the native Skill tool, inspect this existing run, claim its current obligation, and submit actual RESULT/check evidence through the Foundry protocol. Use existing native tasks and in-app agent tabs as the live view. Context grants no permissions. Respect current native permission mode, Stop, tool checks, claims, limits and owner controls. Reconcile this original run/action before creating anything new.'].join('\n')
            const runtimeInstructions=[
              `App record reader: ${runtimeCommand(process.execPath,[process.argv[1]!, 'project-records','read',saved.projectId])}`,
              `Preferred result handoff: ${runtimeCommand(process.execPath,[process.argv[1]!, 'project-records','prepare',saved.projectId,'result-submission.json'])}. Keep the prepared context unchanged, fill the actual artifact/evidence paths and performed checks, then run the same command with submit instead of prepare. This supplies IDs, hashes and CAS fields through the owning writer; never hand-invent them. Exact retries use the same prepared file. Set selfReview only for a genuine self-check; never owner acceptance.`,
              `App result writer: ${runtimeCommand(process.execPath,[process.argv[1]!, 'project-records','record',saved.projectId,'INPUT.json'])}`,
              `Typed record contract: ${workflow.root}/../../src/services/projectRecords/projectRecordContract.ts. Preserve each original operationId across retries. Bind sessionId to the activation nativeSessionId. Record actual artifact hashes, performed criterion checks and self_check review. This agent interface refuses acceptance, owner/independent review and requirement changes. Final owner acceptance remains a hold, never an invented record.`,
              `Supported Foundry runner: ${workflow.root}/scripts/amirahco_workflow.py`,
              `Workflow Python: ${python}. Use this verified executable for all Foundry operations. ${process.platform==='win32'?'Run these commands with the native PowerShell tool.':'Run these commands with the native shell tool.'}`,
              `Inspect this existing run: ${runtimeCommand(python,['-I','-X','utf8',workflow.root+'/scripts/amirahco_workflow.py','inspect','--db',binding.db,'--run-id',binding.runId])}`,
              'Use this runner\'s --help for coordination claims, events and original effects. Load amirahco-work before operating the workflow. Never use sqlite3, raw SQL, or a replacement database reader to inspect or advance Foundry. Do not create a new run.',
            ].join('\n')
            const terminal=['complete','stopped','blocked'].includes(admitted.current_node)
            done(terminal?`Project run reopened: ${admitted.current_node}.`:'Build admitted. Starting the project now…',{display:'system',shouldQuery:!terminal,metaMessages:[packet,runtimeInstructions]})
          }catch(error){setProblem(error instanceof Error?error.message:'Foundry admission is unavailable. The saved activation remains recoverable.')}
        }
        if(snapshot?.activation){void handoff(snapshot);return}
        const workspace=projectContext(snapshot!.answers).currentWorkspace
        void state.run(()=>state.session.activate(workspace,starterCapabilityProfileDigest),()=>{void handoff(state.session.snapshot!)})
      }
      else if(value==='back')wizard.goToStep(STEP.review)
      else if(value==='edit'){setProblem('');setEditing(true)}
      else if(value==='generate')generate(change)
      else if(value==='repair')void state.run(()=>state.session.repair(),()=>{})
      else if(value==='approve'&&snapshot?.prdRequest)void state.run(()=>state.session.prd('prd_approve',snapshot.prdRequest!.requestId),()=>{})
    }}/>}</Box>
}
function Access(){const wizard=useWizard(),done=useContext(Done);return <TesterAccessSetup onBack={()=>wizard.goToStep(STEP.home)} onConnected={()=>{wizard.updateWizardData({testerConnected:true});wizard.goToStep(STEP.home)}} onOtherProvider={()=>done(undefined,{nextInput:'/provider',submitNextInput:true,shouldQuery:false})}/>}
const STEPS=[Home,Idea,Needs,Success,Notes,Helpers,Review,EditDetails,Name,Folder,Projects,Recovery,Personalized,PrdReview,Access].map(Component=>function StoredNativeStep(){return <Box flexDirection="column"><Component/><DraftStatus/></Box>})
export async function call(onDone:LocalJSXCommandOnDone,context?:{options?:{mainLoopModel?:string};abortController?:AbortController;getAppState?:()=>{toolPermissionContext:{mode:string}}},_args?:string,provided?:NativeIntakeSession,requester?:PersonalizedRequester,prdRequester?:PrdRequester){return <Guide onDone={onDone} provided={provided} permissionMode={context?.getAppState?.().toolPermissionContext.mode||'default'} model={context?.options?.mainLoopModel||'configured-route'} prdRequester={prdRequester||((snapshot,change,signal,mayIssue)=>requestPrd(snapshot,change,context?.abortController?AbortSignal.any([signal,context.abortController.signal]):signal,mayIssue,context?.options?.mainLoopModel))} requester={requester||((facts,signal,mayIssue)=>requestPersonalizedQuestions(facts,context?.abortController?AbortSignal.any([signal,context.abortController.signal]):signal,mayIssue,context?.options?.mainLoopModel))}/>}
