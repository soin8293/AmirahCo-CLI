import {spawn} from 'node:child_process'
import {join} from 'node:path'
import {z} from 'zod'
import type {IntakeSnapshot,IntakeStore} from './intakeStore.js'
import {getBundledWorkflowPaths} from './workflowPaths.js'
import {resolveWorkflowPython} from './workflowRuntime.js'

const runState=z.object({revision:z.number().int().nonnegative(),status:z.string(),current_node:z.string()}).passthrough()
const inspection=z.object({run:runState,replay:z.object({matches_projection:z.boolean()}).passthrough()}).passthrough()
export type FoundryBinding=z.infer<typeof inspection>

async function execute(args:string[],mayIssue:()=>boolean|Promise<boolean>=()=>true):Promise<unknown>{
  const python=await resolveWorkflowPython()
  if(!await mayIssue())throw new Error('Build handoff was stopped or changed before workflow dispatch; reopen the same activation.')
  return new Promise((resolve,reject)=>{
    const child=spawn(python,['-I','-X','utf8',...args],{stdio:['ignore','pipe','pipe'],windowsHide:true})
    let stdout='',stderr=''
    child.stdout.setEncoding('utf8').on('data',value=>{stdout+=value})
    child.stderr.setEncoding('utf8').on('data',value=>{stderr+=value})
    child.on('error',reject)
    child.on('close',code=>{
      if(code!==0){reject(new Error(`Foundry driver held the build: ${stderr.trim()||`exit ${code}`}`));return}
      try{resolve(JSON.parse(stdout))}catch{reject(new Error('Foundry driver returned unreadable state; reopen the same activation.'))}
    })
  })
}

function inputs(snapshot:IntakeSnapshot){
  const activation=snapshot.activation,prd=snapshot.prd
  if(!activation||!prd?.approved||snapshot.stopped||prd.stale||prd.projectionPending||snapshot.projectionPending||prd.revision!==activation.planRevision||prd.meaningHash!==activation.meaningHash)throw new Error('Exact current, published, unstopped activation and approved PRD are required before Foundry binding.')
  return {project_id:snapshot.projectId,native_session_id:activation.nativeSessionId,context_revision:`${activation.contextPacketId}@${activation.contextPacketRevision}`,context_digest:activation.contextDigest,control_ref:`activation:${activation.activationId}@${activation.revision}`,approved_prd_revision:`${prd.revision}:${prd.meaningHash}`,approval_ref:`app-record:approval:${snapshot.projectId}:${prd.revision}`,activation_ref:`app-record:activation:${activation.activationId}@${activation.revision}`,skill_profile:activation.capabilityProfileDigest,prd_path:prd.file}
}

function runner(){
  const paths=getBundledWorkflowPaths()
  if(!paths)throw new Error('Packaged Foundry runtime is missing; activation is preserved but work is held.')
  return join(paths.root,'scripts','amirahco_workflow.py')
}

export async function bindFoundryActivation(store:Pick<IntakeStore,'root'|'read'>,snapshot:IntakeSnapshot,mayIssue:()=>boolean|Promise<boolean>=()=>true){
  const activation=snapshot.activation
  if(!activation)throw new Error('Build activation is missing.')
  const db=join(store.root,snapshot.projectId,'foundry.sqlite')
  const expected=inputs(snapshot)
  const value=await execute([runner(),'bind-activation','--db',db,'--run-id',activation.activationId,'--input-json',JSON.stringify(expected)],async()=>await mayIssue()&&JSON.stringify(inputs(await store.read(snapshot.projectId)))===JSON.stringify(expected))
  const parsed=inspection.parse(value)
  if(!parsed.replay.matches_projection)throw new Error('Foundry activation readback is not current; reopen the same activation.')
  return {db,runId:activation.activationId,inspection:parsed}
}

export async function admitFoundry(binding:{db:string;runId:string;inspection:FoundryBinding},controlRef:string,permissionState:string,nativeSessionId:string,model:string,mayIssue:()=>boolean|Promise<boolean>=()=>true){
  const provider=model.includes('/')?model.split('/')[0]!:'configured-route'
  const value=await execute([runner(),'admit','--db',binding.db,'--run-id',binding.runId,'--expected-revision',String(binding.inspection.run.revision),'--control-ref',controlRef,'--permission-state',permissionState,'--native-session-id',nativeSessionId,'--provider',provider,'--model',model],mayIssue)
  return runState.parse(value)
}

export async function evaluateIntegratedCompletion(store:IntakeStore,snapshot:IntakeSnapshot){
  if(!snapshot.activation)throw new Error('Build activation is missing.')
  const db=join(store.root,snapshot.projectId,'foundry.sqlite'),runId=snapshot.activation.activationId
  const [app,foundryRaw,coordinationRaw]=await Promise.all([
    store.completion(snapshot.projectId),
    execute([runner(),'inspect','--db',db,'--run-id',runId]),
    execute([runner(),'coordination','--db',db,'--operation','inspect','--payload-json',JSON.stringify({run_id:runId})]),
  ])
  const foundry=z.object({run:runState,waits:z.array(z.object({state:z.string()}).passthrough()),outbox:z.array(z.object({state:z.string()}).passthrough()),replay:z.object({matches_projection:z.boolean()}).passthrough()}).passthrough().parse(foundryRaw)
  const coordination=z.object({control:z.object({stopped:z.union([z.number(),z.boolean()])}).passthrough().nullable(),events:z.array(z.object({kind:z.string(),sequence:z.number(),body:z.record(z.string(),z.unknown())}).passthrough()),attempts:z.array(z.object({state:z.string()}).passthrough()),claims:z.array(z.object({state:z.string()}).passthrough()),schedules:z.array(z.object({state:z.string()}).passthrough()),route:z.object({drain_ready:z.boolean()}).passthrough().nullable()}).parse(coordinationRaw)
  const blockers=[...app.blockers]
  if(!foundry.replay.matches_projection)blockers.push('Foundry projection does not match replay')
  if(foundry.run.status!=='terminal'||foundry.run.current_node!=='complete')blockers.push(`Foundry run is ${foundry.run.status} at ${foundry.run.current_node}`)
  if(foundry.waits.some(wait=>wait.state==='active'))blockers.push('Foundry has an active wait')
  if(foundry.outbox.some(effect=>effect.state!=='delivered'))blockers.push('Foundry has an actionable or uncertain outbox effect')
  if(Boolean(coordination.control?.stopped))blockers.push('coordination Stop is active')
  if(coordination.attempts.some(attempt=>attempt.state!=='observed'))blockers.push('an original effect is reserved or uncertain')
  if(coordination.claims.some(claim=>claim.state==='active'))blockers.push('write-scope claims remain active')
  if(coordination.schedules.some(occurrence=>!['accepted','discarded'].includes(occurrence.state)))blockers.push('a protected schedule occurrence lacks accepted/discarded readback')
  if(coordination.route&&!coordination.route.drain_ready)blockers.push('not every agent adopted the committed route/context head')
  const answers=new Set(coordination.events.filter(event=>event.kind==='ANSWER'&&typeof event.body.correlation_id==='string').map(event=>event.body.correlation_id))
  if(coordination.events.some(event=>event.kind==='ASK'&&(typeof event.body.correlation_id!=='string'||!answers.has(event.body.correlation_id))))blockers.push('pending ASKs remain')
  return {ready:blockers.length===0,blockers,app,foundry:foundry.run,coordination}
}
