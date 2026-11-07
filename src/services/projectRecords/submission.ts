import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {readFile,writeFile,realpath,stat} from 'node:fs/promises'
import {resolve,relative,isAbsolute,dirname} from 'node:path'
import {z} from 'zod'
import type {IntakeStore,IntakeSnapshot} from './intakeStore.js'
import type {ProjectRecordMutation} from './projectRecordContract.js'

const locator=z.string().min(1).max(4096).refine(value=>!isAbsolute(value)&&!value.split(/[\\/]/).includes('..'))
const contextSchema=z.object({projectId:z.string().uuid(),activationId:z.string().uuid(),nativeSessionId:z.string(),intakeSequence:z.number().int().nonnegative(),prdRevision:z.number().int().positive(),meaningHash:z.string().regex(/^[0-9a-f]{64}$/)}).strict()
export const resultSubmission=z.object({version:z.literal(1),context:contextSchema,artifacts:z.array(locator).max(64),checks:z.array(z.object({criterionKey:z.string().regex(/^R[1-9]\d*-C[1-9]\d*$/),artifactPaths:z.array(locator).min(1).max(64),evidencePaths:z.array(locator).min(1).max(64),method:z.string().min(1).max(128),outcome:z.enum(['pass','fail','blocked'])}).strict()).max(48),selfReview:z.boolean()}).strict()

// RFC 4122 v5 identities bind the exact prepared context and observed content.
// Repeating the same submission never invents a new operation after a lost reply.
export function submissionIdentity(value:unknown){
  const bytes=createHash('sha1').update(Buffer.from('c6310d3844924a5cab18eaef1bfb0abc','hex')).update(JSON.stringify(value)).digest().subarray(0,16)
  bytes[6]=(bytes[6]!&15)|80;bytes[8]=(bytes[8]!&63)|128
  const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
function context(snapshot:IntakeSnapshot){
  const active=snapshot.activation
  if(!active||!snapshot.prd?.approved||snapshot.prd.stale||snapshot.prd.projectionPending||snapshot.projectionPending||snapshot.stopped||snapshot.prd.revision!==active.planRevision||snapshot.prd.meaningHash!==active.meaningHash)throw new Error('A current approved, published and unstopped activation is required.')
  return {projectId:snapshot.projectId,activationId:active.activationId,nativeSessionId:active.nativeSessionId,intakeSequence:snapshot.sequence,prdRevision:active.planRevision,meaningHash:active.meaningHash}
}
async function scopedPath(root:string,locator:string,newFile=false){
  const base=await realpath(root),path=resolve(base,locator),inside=relative(base,path)
  if(inside.startsWith('..')||isAbsolute(inside))throw new Error('Submission path must stay inside the activated workspace.')
  const actual=await realpath(newFile?dirname(path):path),resolved=relative(base,actual)
  if(resolved.startsWith('..')||isAbsolute(resolved))throw new Error('Submission path resolves outside the activated workspace.')
  return path
}
export async function prepareResultSubmission(store:IntakeStore,projectId:string,file:string){
  const snapshot=await store.read(projectId),binding=context(snapshot)
  const path=await scopedPath(snapshot.activation!.workspaceRoot,file,true)
  const criteria=snapshot.prd!.records.filter(row=>row.kind==='criterion'&&row.body.blocking)
  const draft={version:1,context:binding,artifacts:[],checks:criteria.filter(row=>row.body.method!=='owner_review').map(row=>({criterionKey:row.key,artifactPaths:[],evidencePaths:[],method:'',outcome:'blocked'})),selfReview:false}
  await writeFile(path,JSON.stringify(draft,null,2)+'\n',{flag:'wx',mode:0o600})
  return {prepared:path,criteria:criteria.map(row=>({key:row.key,...row.body})),instruction:'Keep context and criterion keys unchanged. Fill artifacts (relative paths), checks (artifactPaths, evidencePaths, performed method, observed outcome), and selfReview. Submit this same file; never regenerate it to retry an uncertain result. Owner review is never supplied by this interface.'}
}
export async function submitResult(store:IntakeStore,projectId:string,file:string){
  const snapshot=await store.read(projectId),binding=context(snapshot),path=await scopedPath(snapshot.activation!.workspaceRoot,file)
  if((await stat(path)).size>131072)throw new Error('Submission exceeds 128 KiB; nothing was truncated.')
  const input=resultSubmission.parse(JSON.parse(await readFile(path,'utf8')))
  if(JSON.stringify(input.context)!==JSON.stringify(binding))throw new Error('Prepared submission context changed. Reconcile the original results; do not refresh its context or transfer approval.')
  const keys=input.checks.map(check=>check.criterionKey)
  if(new Set(keys).size!==keys.length)throw new Error('Submit one current outcome per criterion.')
  if(input.selfReview&&snapshot.prd!.records.some(row=>row.kind==='criterion'&&row.body.blocking&&!keys.includes(row.key)))throw new Error('Self-review must cover every current blocking criterion in this submission.')
  const targets=input.checks.map(check=>{
    const criterion=snapshot.prd!.records.find(row=>row.kind==='criterion'&&row.key===check.criterionKey)
    if(!criterion)throw new Error(`Unknown current criterion: ${check.criterionKey}`)
    if(criterion.body.method==='owner_review')throw new Error('Agent submissions cannot perform owner review criteria.')
    return criterion
  })
  const names=[...new Set([...input.artifacts,...input.checks.flatMap(check=>[...check.artifactPaths,...check.evidencePaths])])].sort()
  if(names.length>64)throw new Error('Submission exceeds 64 distinct artifacts/evidence files.')
  const observations=await Promise.all(names.map(async name=>{
    const path=await scopedPath(snapshot.activation!.workspaceRoot,name),before=await stat(path)
    if(!before.isFile())throw new Error('Submit regular artifact/evidence files only.')
    const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk)
    const after=await stat(path);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw new Error('Artifact changed while hashing; no submission was admitted.')
    return {name,byteLength:before.size,sha256:hash.digest('hex')}
  }))
  const before=await store.completion(projectId),artifacts=new Map<string,{id:string;hash:string}>(),checkIds:string[]=[]
  const base={projectId,sessionId:binding.nativeSessionId,expectedSequence:binding.intakeSequence,links:[]}
  const write=async(value:ProjectRecordMutation)=>{
    if(JSON.stringify(context(await store.read(projectId)))!==JSON.stringify(binding))throw new Error('Submission was fenced by a changed project/control revision. Preserve this original file.')
    return store.record(value)
  }
  const submissionId=submissionIdentity([binding,relative(await realpath(snapshot.activation!.workspaceRoot),await realpath(path))])
  // The sole writer seals the complete original intent before any result effect.
  // A retry with changed files or edited checks conflicts with this same operation.
  await write({...base,type:'submission_intent',operationId:submissionIdentity([submissionId,'intent']),recordId:submissionIdentity([submissionId,'intent-record']),activationId:binding.activationId,submissionId,serialized:JSON.stringify({input,observations})})
  for(const observed of observations){
    const existing=before.artifacts.find(row=>row.relative_locator===observed.name&&row.sha256===observed.sha256&&row.byte_length===observed.byteLength)
    const identity=submissionIdentity([binding,'artifact',observed])
    const id=existing?.artifact_id||identity
    if(!existing)await write({...base,type:'artifact',operationId:submissionIdentity([identity,'observe']),recordId:submissionIdentity([identity,'record']),artifactId:id,kind:input.artifacts.includes(observed.name)?'file':'evidence',relativeLocator:observed.name,byteLength:observed.byteLength,sha256:observed.sha256,classification:'private-project'})
    artifacts.set(observed.name,{id,hash:observed.sha256})
  }
  for(const [index,check] of input.checks.entries()){
    const target=targets[index]!,refs=[...new Set([...check.artifactPaths,...check.evidencePaths])].sort().map(name=>artifacts.get(name)!)
    const identity=submissionIdentity([binding,'check',target.id,target.revision,check,refs])
    if(!before.checkIds.includes(identity))await write({...base,type:'check',operationId:submissionIdentity([identity,'observe']),recordId:identity,criterionId:target.id,criterionRevision:target.revision,artifactIds:refs.map(ref=>ref.id),inputHashes:refs.map(ref=>ref.hash),checker:`native-session:${binding.nativeSessionId}`,method:check.method,outcome:check.outcome,evidenceRefs:check.evidencePaths})
    checkIds.push(identity)
  }
  let reviewId:string|undefined
  if(input.selfReview){
    if(!checkIds.length)throw new Error('Self-review needs performed checks in this submission.')
    const coverage=await store.completion(projectId),refs=[...artifacts.values()],passed=coverage.satisfiedCriteria.length===coverage.blockingCriteria.length&&input.checks.every(check=>check.outcome==='pass')
    reviewId=submissionIdentity([binding,'self-review',refs,checkIds])
    if(coverage.reviewId!==reviewId)await write({...base,type:'review',operationId:submissionIdentity([reviewId,'observe']),recordId:reviewId,reviewer:`native-session:${binding.nativeSessionId}`,criteriaRevision:`prd:${binding.prdRevision}:${binding.meaningHash}`,artifactIds:refs.map(ref=>ref.id),checkIds,inputHashes:refs.map(ref=>ref.hash),verdict:passed?'pass':'blocked',findings:['Self-check only; final owner acceptance has not been performed.'],independence:'self_check'})
  }
  return {artifactIds:[...artifacts.values()].map(ref=>ref.id),checkIds,reviewId,completion:await store.completion(projectId)}
}
