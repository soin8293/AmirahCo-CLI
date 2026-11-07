import {readFile,stat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve,relative,isAbsolute} from 'node:path'
import {z} from 'zod'
import {IntakeStore,intakeStateRoot,type IntakeSnapshot} from './intakeStore.js'
import {projectRecordMutation,type ProjectRecordMutation} from './projectRecordContract.js'
import {prepareResultSubmission,submitResult} from './submission.js'

/** Native management surface for the existing writer, never a second SQL writer. */
export function validateAgentRecord(input:unknown,snapshot:IntakeSnapshot):ProjectRecordMutation{
  const request=projectRecordMutation.parse(input),active=snapshot.activation
  if(request.projectId!==snapshot.projectId||!active||request.sessionId!==active.nativeSessionId)throw new Error('Record must bind the existing activated project and native lead session.')
  if(snapshot.stopped||!snapshot.prd?.approved||snapshot.prd.stale||snapshot.prd.projectionPending||snapshot.projectionPending||snapshot.prd.revision!==active.planRevision||snapshot.prd.meaningHash!==active.meaningHash)throw new Error('Current approved, published and unstopped activation is required.')
  if(request.type==='acceptance'||request.type==='requirement_change'||(request.type==='review'&&request.independence!=='self_check'))throw new Error('Agent records cannot impersonate owner/independent review, accept work or change requirements.')
  return request
}

export async function projectRecordsCommand(args:string[]):Promise<unknown>{
  const [operation,id,...rest]=args
  if(args.length===0||operation==='--help'||operation==='help')return {usage:['project-records prepare PROJECT_ID submission.json','project-records submit PROJECT_ID submission.json','project-records read PROJECT_ID','project-records completion PROJECT_ID','project-records verify PROJECT_ID','project-records record PROJECT_ID INPUT.json'],recordKinds:['run_binding','artifact','check','review (self_check only)','incident','lesson'],commonFields:['projectId','operationId (original UUID)','sessionId (activation.nativeSessionId)','expectedSequence (saved intake sequence)','recordId','type','links'],authority:'Agent evidence only; owner/independent acceptance and requirement changes are refused.'}
  const projectId=z.string().uuid().parse(id)
  if(!['read','record','completion','verify','prepare','submit'].includes(operation||''))throw new Error('Usage: project-records read|completion|verify PROJECT_ID; project-records record|prepare|submit PROJECT_ID INPUT.json')
  if(rest.length!==(['record','prepare','submit'].includes(operation!)?1:0))throw new Error('Unexpected project-records arguments.')
  const store=new IntakeStore(intakeStateRoot())
  try{
    if(operation==='prepare')return await prepareResultSubmission(store,projectId,rest[0]!)
    if(operation==='submit')return await submitResult(store,projectId,rest[0]!)
    const snapshot=await store.read(projectId)
    if(operation==='read')return snapshot
    if(operation==='completion')return await store.completion(projectId)
    if(operation==='verify'){
      const {evaluateIntegratedCompletion}=await import('./foundryBridge.js')
      return await evaluateIntegratedCompletion(store,snapshot)
    }
    const file=rest[0]!
    if((await stat(file)).size>131072)throw new Error('Record input exceeds 128 KiB; nothing was truncated.')
    const input=validateAgentRecord(JSON.parse(await readFile(file,'utf8')),snapshot)
    const verifyBytes=async(locator:string,byteLength:number,sha256:string)=>{
      const root=resolve(snapshot.activation!.workspaceRoot),artifact=resolve(root,locator),inside=relative(root,artifact)
      if(inside.startsWith('..')||isAbsolute(inside))throw new Error('Artifact must be inside the activated workspace.')
      // Resolve symlinks too: a relative name alone does not establish workspace scope.
      const {realpath}=await import('node:fs/promises')
      const actual=relative(await realpath(root),await realpath(artifact))
      if(actual.startsWith('..')||isAbsolute(actual))throw new Error('Artifact resolves outside the activated workspace.')
      const bytes=await readFile(artifact)
      if(bytes.length!==byteLength||createHash('sha256').update(bytes).digest('hex')!==sha256)throw new Error('Artifact bytes changed; record their actual immutable identity.')
    }
    if(input.type==='artifact')await verifyBytes(input.relativeLocator,input.byteLength,input.sha256)
    if(input.type==='check'||input.type==='review'){
      const manifest=await store.completion(projectId)
      for(const artifactId of input.artifactIds){
        const artifact=manifest.artifacts.find(row=>row.artifact_id===artifactId)
        if(!artifact||!input.inputHashes.includes(artifact.sha256))throw new Error('Evidence input hashes must include the exact recorded artifact hashes; inspect project-records completion.')
        await verifyBytes(artifact.relative_locator,artifact.byte_length,artifact.sha256)
      }
      if(input.type==='check'&&!snapshot.prd!.records.some(row=>row.kind==='criterion'&&row.id===input.criterionId&&row.revision===input.criterionRevision))throw new Error('Check must target a current PRD criterion identity and revision from read.prd.records.')
    }
    return await store.record(input)
  }finally{await store.close()}
}
