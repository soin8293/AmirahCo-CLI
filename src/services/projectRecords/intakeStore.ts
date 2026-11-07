import {createStorageWorker,type StorageWorker} from './storageWorker.js'
import {homedir} from 'node:os'
import {isAbsolute,join,resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {getSessionId} from '../../bootstrap/state.js'
import {clarificationState} from '../../commands/start/clarification.js'
import {prdMutation,type PrdMutation,type PrdState,type PrdRequest,type PrdDraft} from '../../commands/start/prdContract.js'
import {activationMutation,type ActivationMutation,type ActivationState} from './integrationContract.js'
import {projectRecordMutation,type ProjectRecordMutation} from './projectRecordContract.js'
import workerSource from './intakeWorker.cjs' with {type:'text'}
import windowsSource from './windowsStorage.cjs' with {type:'text'}

const text=z.string().refine(value=>Buffer.byteLength(value,'utf8')<=32768,'Each answer must fit 32 KiB; shorten it or reference a document.')
export const intakeAnswers=z.object({idea:text.optional(),needs:text.optional(),success:text.optional(),notes:text.optional(),helpers:z.string().regex(/^[1-9]\d*$/).refine(value=>Number.isSafeInteger(Number(value))).optional(),name:text.optional(),folder:text.optional()}).strict()
export type IntakeAnswers=z.infer<typeof intakeAnswers>
export type IntakeSnapshot={projectId:string;sequence:number;answers:IntakeAnswers;step:number;phase:'intake'|'review'|'context_ready';stopped:boolean;projectionPending:boolean;clarification?:string;recoveryError?:string;unavailable?:boolean;error?:string;sessionIds?:string[];prd?:PrdState;prdRequest?:PrdRequest;activation?:ActivationState}
export type CompletionEvaluation={projectId:string;ready:boolean;blockingCriteria:string[];satisfiedCriteria:string[];blockers:string[];artifactIds:string[];artifacts:{artifact_id:string;relative_locator:string;byte_length:number;sha256:string}[];checkIds:string[];reviewId?:string;acceptanceId?:string}
const clarification=z.string().refine(value=>{try{return Buffer.byteLength(value,'utf8')<=32768&&clarificationState.safeParse(JSON.parse(value)).success}catch{return false}},'Invalid saved clarification state.')
const mutation=z.object({projectId:z.string().uuid(),operationId:z.string().uuid(),sessionId:z.string().min(1).max(256),type:z.enum(['save','stop','resume','confirm']),expectedSequence:z.number().int().safe().nonnegative(),answers:intakeAnswers,step:z.number().int().min(1).max(12),phase:z.enum(['intake','review','context_ready']),create:z.boolean(),clarification:clarification.optional(),origin:z.enum(['owner','application']).optional()}).strict()
export type IntakeMutation=z.infer<typeof mutation>
type Job={id:number;method:string;args:unknown;resolve:(value:any)=>void;reject:(error:Error)=>void}
export class IntakeStorageError extends Error {constructor(public code:string,message:string){super(message);this.name='IntakeStorageError'}}

/** Location is independent from native config/history and the requested build folder. */
export function intakeStateRoot(){
  if(process.platform==='win32'){
    const base=process.env.XDG_STATE_HOME||process.env.LOCALAPPDATA
    if(!base||!isAbsolute(base)||!(/^[a-zA-Z]:[\\/]/.test(base)))throw new IntakeStorageError('HOST','Use a Windows-local LOCALAPPDATA directory for project records.')
    return process.env.XDG_STATE_HOME?join(base,'amirahco-cli','projects'):join(base,'AmirahCo CLI','state','projects')
  }
  if(process.platform!=='linux')throw new IntakeStorageError('HOST','Saved intake currently requires the Linux/WSL development runtime.')
  const state=process.env.XDG_STATE_HOME||join(homedir(),'.local','state')
  if(!isAbsolute(state)||resolve(state).startsWith('/mnt/'))throw new IntakeStorageError('HOST','Use an absolute Linux-local XDG_STATE_HOME for intake records; mounted Windows/cloud state is unsupported.')
  return join(state,'amirahco-cli','projects')
}

/** Sole typed API. The synchronous SQLite driver runs off the terminal thread. */
export class IntakeStore {
  private worker?:StorageWorker
  private nextId=0
  private active?:Job
  private normal:Job[]=[]
  private controls:Job[]=[]
  private closed=false
  private intentionallyClosed=false
  private workerExited?:Promise<void>
  constructor(readonly root:string,private testFault?:string){
    if(!isAbsolute(root))throw new IntakeStorageError('PATH','The private state root must be absolute.')
    if(testFault&&process.env.NODE_ENV!=='test')throw new IntakeStorageError('TEST_ONLY','Fault injection is restricted to explicit test processes.')
  }
  private request<T>(method:string,args:unknown,control=false):Promise<T>{
    if(this.closed)return Promise.reject(new IntakeStorageError('CLOSED','The intake writer is closed. Reopen the original project.'))
    const queue=control?this.controls:this.normal
    if(queue.length>=(control?16:128))return Promise.reject(new IntakeStorageError('QUEUE_FULL','Save queue is full. Input is unsaved; Stop remains effective.'))
    return new Promise<T>((resolve,reject)=>{queue.push({id:++this.nextId,method,args,resolve,reject});this.pump()})
  }
  private pump(){
    if(this.active||this.closed)return
    const next=this.controls.shift()||this.normal.shift();if(!next){this.worker?.unref();return}
    if(!this.worker){
      this.worker=createStorageWorker(workerSource,windowsSource,{root:this.root,...(this.testFault?{fault:this.testFault}:{})})
      let didExit:()=>void=()=>{}
      this.workerExited=new Promise<void>(resolve=>{didExit=resolve})
      this.worker.on('message',message=>{
        const job=this.active
        if(!job||job.id!==message.id)return
        this.active=undefined
        if(message.error)job.reject(new IntakeStorageError(message.error.code,message.error.message));else job.resolve(message.result)
        this.pump()
      })
      const lost=(cause?:unknown)=>{
        const error=new IntakeStorageError('UNKNOWN','Writer stopped before its reply. Reconcile the original save; do not create another project.')
        if(cause instanceof Error)Object.defineProperty(error,'cause',{value:cause})
        this.active?.reject(error);this.active=undefined
        for(const job of [...this.controls,...this.normal])job.reject(error)
        this.controls=[];this.normal=[];this.closed=true
      }
      this.worker.on('error',lost);this.worker.on('exit',(_code,reason)=>{if(!this.closed)lost(reason);this.worker=undefined;didExit()})
    }
    this.active=next;this.worker.ref();this.worker.postMessage({id:next.id,method:next.method,args:next.args})
  }
  save(input:IntakeMutation):Promise<IntakeSnapshot>{return this.request('save',mutation.parse(input),input.type!=='save')}
  prd(input:PrdMutation):Promise<IntakeSnapshot>{return this.request('prd',prdMutation.parse(input))}
  activate(input:ActivationMutation):Promise<IntakeSnapshot>{return this.request('activate',activationMutation.parse(input))}
  record(input:ProjectRecordMutation):Promise<IntakeSnapshot>{return this.request('record',projectRecordMutation.parse(input))}
  completion(projectId:string):Promise<CompletionEvaluation>{return this.request('completion',{projectId:z.string().uuid().parse(projectId)},true)}
  read(projectId:string):Promise<IntakeSnapshot>{return this.request('read',{projectId:z.string().uuid().parse(projectId)},true)}
  repair(projectId:string):Promise<IntakeSnapshot>{return this.request('repair',{projectId:z.string().uuid().parse(projectId)},true)}
  list(offset=0):Promise<IntakeSnapshot[]>{return this.request('list',{offset:z.number().int().safe().nonnegative().parse(offset)})}
  async recover(){if(this.intentionallyClosed)throw new IntakeStorageError('CLOSED','Open a new native intake view.');if(this.closed){await this.workerExited;this.closed=false;this.testFault=undefined}}
  async close(){this.intentionallyClosed=true;this.closed=true;const error=new IntakeStorageError('UNKNOWN','Writer closed; reconcile any original pending save.');this.active?.reject(error);for(const job of [...this.controls,...this.normal])job.reject(error);await this.worker?.terminate();this.worker=undefined}
}

let hold:{sessionId:string;reason:string}|undefined
export function setIntakeWorkHold(reason?:string,sessionId:string=getSessionId()){
  if(reason){hold={sessionId,reason};return}
  if(!hold||hold.sessionId===sessionId)hold=undefined
}
export function intakeWorkHoldReason(sessionId:string=getSessionId()){return hold?.sessionId===sessionId?hold.reason:undefined}

/** Read existing record provenance; no migration, new store or inferred link. */
export async function savedIntakeBlockerForSession(sessionId:string,provided?:Pick<IntakeStore,'list'>):Promise<string|undefined>{
  let store=provided
  try{
    store ||= new IntakeStore(intakeStateRoot())
    for(let offset=0;;offset+=200){
      const rows=await store.list(offset)
      if(rows.some(row=>row.unavailable))return 'Saved intake state could not be verified. Use /start → Open saved project to inspect the unavailable intake. Nothing was replaced.'
      for(const row of rows.filter(row=>row.sessionIds?.includes(sessionId))){
        if(row.stopped)return 'This project intake is stopped. Use /start → Open saved project → Resume saved intake before continuing this session.'
        if(row.projectionPending)return 'This project intake needs save recovery. Use /start → Open saved project to reconcile the original save.'
      }
      if(rows.length<200)return undefined
    }
  }catch{return 'Saved intake state could not be read. Use /start → Open saved project to reconcile it; saved sessions are preserved.'}
  finally{if(!provided&&store)await (store as IntakeStore).close()}
}

/** One UI session; original requests survive failure for exact reconciliation. */
export class NativeIntakeSession {
  snapshot?:IntakeSnapshot
  projectId:string=randomUUID()
  pending?:IntakeMutation|PrdMutation|ActivationMutation
  private inFlight:Promise<IntakeSnapshot>|undefined
  private generation=0
  private stopped=false
  private explicitStop=false
  started=false
  constructor(readonly store:IntakeStore,readonly sessionId:string){}
  get isStopped(){return this.stopped}
  get hasExplicitStop(){return this.explicitStop}
  async repair(){const result=await this.store.repair(this.projectId);this.snapshot=result;if(!this.stopped&&!result.projectionPending)setIntakeWorkHold(undefined,this.sessionId);return result}
  newDraft(){this.started=true;this.snapshot=undefined;this.projectId=randomUUID();this.pending=undefined;this.stopped=false;this.explicitStop=false;setIntakeWorkHold(undefined,this.sessionId)}
  async open(id:string){
    this.started=true
    this.projectId=id;this.snapshot=undefined;this.pending=undefined
    this.stopped=true;setIntakeWorkHold('Reopen the saved intake and explicitly continue or resume it before sending a project prompt.',this.sessionId)
    this.snapshot=await this.store.read(id);this.explicitStop=this.snapshot.stopped;return this.snapshot
  }
  private async perform(request:IntakeMutation|PrdMutation|ActivationMutation){
    const generation=this.generation
    this.pending=request
    const promise=request.type==='activate'?this.store.activate(request):'requestId' in request?this.store.prd(request):this.store.save(request);this.inFlight=promise
    try{
      const result=await promise;this.snapshot=result;this.pending=undefined
      if(generation===this.generation&&(request.type==='resume'||request.type==='confirm')&&!result.stopped){this.stopped=false;this.explicitStop=false;setIntakeWorkHold(undefined,this.sessionId)}
      if(result.projectionPending)setIntakeWorkHold('Saved intake projection needs repair. Use /start before sending project prompts.',this.sessionId)
      else if(generation===this.generation&&!this.stopped)setIntakeWorkHold(undefined,this.sessionId)
      return result
    }catch(error){setIntakeWorkHold('An intake save is unresolved. Use /start to reconcile it before sending project prompts.',this.sessionId);throw error}finally{if(this.inFlight===promise)this.inFlight=undefined}
  }
  save(answers:IntakeAnswers,step:number,phase:IntakeSnapshot['phase']='intake',clarification?:string,origin:'owner'|'application'='owner'){
    this.started=true
    if(this.pending)throw new IntakeStorageError('PENDING','Reconcile the original failed save before submitting another edit.')
    return this.perform({projectId:this.projectId,operationId:randomUUID(),sessionId:this.sessionId,type:'save',expectedSequence:this.snapshot?.sequence||0,answers,step,phase,create:!this.snapshot,...(clarification===undefined?{}:{clarification}),...(origin==='application'?{origin}:{})})
  }
  async retry(){if(!this.pending)throw new IntakeStorageError('PENDING','No original save is pending.');if('requestId' in this.pending&&this.stopped)throw new IntakeStorageError('STOPPED','Resume the saved intake before retrying a PRD operation.');const original=this.pending;await this.store.recover();return this.perform(original)}
  prd(type:PrdMutation['type'],requestId:string,changeRequest?:string,draft?:PrdDraft){
    if(this.stopped||this.snapshot?.stopped)throw new IntakeStorageError('STOPPED','Resume the saved intake before changing or approving its PRD.')
    if(!this.snapshot||this.pending)throw new IntakeStorageError('PENDING','Save or reconcile the original intake first.')
    return this.perform({projectId:this.projectId,operationId:randomUUID(),sessionId:this.sessionId,type,requestId,...(type==='prd_approve'?{reviewedMeaningHash:this.snapshot.prd?.meaningHash}:{}),expectedSequence:this.snapshot.sequence,expectedPlanRevision:this.snapshot.prd?.revision||0,...(changeRequest===undefined?{}:{changeRequest}),...(draft===undefined?{}:{draft})})
  }
  activate(workspaceRoot:string,capabilityProfileDigest:string){
    if(this.stopped||this.snapshot?.stopped)throw new IntakeStorageError('STOPPED','Resume the saved project before Build.')
    if(!this.snapshot||this.pending)throw new IntakeStorageError('PENDING','Save or reconcile the original project operation first.')
    const prd=this.snapshot.prd
    if(!prd?.approved)throw new IntakeStorageError('PRD_REVIEW','Approve the exact current PRD before Build.')
    return this.perform({projectId:this.projectId,operationId:randomUUID(),sessionId:this.sessionId,type:'activate',expectedSequence:this.snapshot.sequence,expectedPlanRevision:prd.revision,reviewedMeaningHash:prd.meaningHash,selectedTotal:Number(this.snapshot.answers.helpers||1),workspaceRoot,nativeSessionId:this.sessionId,capabilityProfileDigest})
  }
  async stop(answers:IntakeAnswers,step:number){
    this.requestStop()
    // The live gate is already closed, even while another write/queue is blocked.
    await this.inFlight?.catch(()=>{})
    await this.store.recover()
    let current=this.snapshot
    try{current=await this.store.read(this.projectId)}catch(error){if(this.snapshot)throw error}
    this.pending=undefined
    return this.perform({projectId:this.projectId,operationId:randomUUID(),sessionId:this.sessionId,type:'stop',expectedSequence:current?.sequence||0,answers:current?.answers||answers,step:current?.step||step,phase:current?.phase||'intake',create:!current})
  }
  requestStop(){this.generation++;this.stopped=true;this.explicitStop=true;setIntakeWorkHold('This intake is stopped. Use /start → Open saved project → Resume saved intake.',this.sessionId)}
  async resume(){
    if(!this.snapshot)throw new IntakeStorageError('RECOVERY','Select the saved intake first.')
    const request:IntakeMutation={projectId:this.projectId,operationId:randomUUID(),sessionId:this.sessionId,type:this.snapshot.stopped||this.explicitStop?'resume':'confirm',expectedSequence:this.snapshot.sequence,answers:this.snapshot.answers,step:this.snapshot.step,phase:this.snapshot.phase,create:false}
    return this.perform(request)
  }
}
