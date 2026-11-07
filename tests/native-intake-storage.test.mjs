import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,stat,symlink,copyFile,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const {IntakeStore,NativeIntakeSession,intakeWorkHoldReason,savedIntakeBlockerForSession}=await import(process.env.AMIRAHCO_INTAKE_TEST_MODULE)
const {projectRecordsCommand,submitResult}=await import(process.env.AMIRAHCO_INTAKE_TEST_MODULE)
const fixture=async()=>{
 const base=await mkdtemp(join(tmpdir(),'amirahco-intake-fixture-'))
 if(process.platform!=='win32')return base
 const root=join(base,'private records with spaces'),require=createRequire(import.meta.url)
 const source=await readFile(new URL('../src/services/projectRecords/windowsStorage.cjs',import.meta.url),'utf8')
 const platform=new Function('require',`${source};return createWindowsStorage`)(require)(root,require.resolve('koffi'))
 try{platform.mkdir(root)}finally{platform.close()}
 return root
}
const mutation=(id,overrides={})=>({projectId:id,operationId:randomUUID(),sessionId:'explicit-native-test-fixture',type:'save',expectedSequence:0,answers:{idea:'A bakery menu',needs:'No payments',success:'Readable on a phone',helpers:'1'},step:6,phase:'review',create:true,...overrides})

const draft=()=>({title:'Bakery menu',summary:'A readable local menu without payments.',requirements:[{key:'R1',outcome:'Show the menu clearly on a phone',scope:'required',priority:'high',exclusions:['No payments'],openQuestions:[],sourceFields:['needs','success'],criteria:[{key:'C1',description:'The owner can read the menu on a phone',method:'owner_review',blocking:true}]}],assumptions:[],openQuestions:[]})
async function prdRequest(store,id,change=''){
 const before=await store.read(id)
 const request={projectId:id,operationId:randomUUID(),sessionId:'actual-prd-ui-fixture',type:'prd_request',expectedSequence:before.sequence,expectedPlanRevision:before.prd?.revision||0,requestId:randomUUID(),changeRequest:change}
 await store.prd(request)
 return {projectId:id,operationId:randomUUID(),sessionId:request.sessionId,type:'prd_candidate',expectedSequence:request.expectedSequence,expectedPlanRevision:request.expectedPlanRevision,requestId:request.requestId,draft:draft()}
}
async function approvePrd(store,id){
 const before=await store.read(id)
 return store.prd({projectId:id,operationId:randomUUID(),sessionId:'actual-owner-review-fixture',type:'prd_approve',expectedSequence:before.sequence,expectedPlanRevision:before.prd.revision,requestId:before.prdRequest.requestId,reviewedMeaningHash:before.prd.meaningHash})
}
async function activateProject(store,id,overrides={}){
 const before=await store.read(id)
 return store.activate({projectId:id,operationId:randomUUID(),sessionId:'native-build-fixture',type:'activate',expectedSequence:before.sequence,expectedPlanRevision:before.prd.revision,reviewedMeaningHash:before.prd.meaningHash,selectedTotal:Number(before.answers.helpers||1),workspaceRoot:process.platform==='win32'?await fixture():'/workspace/bakery',nativeSessionId:'native-build-fixture',capabilityProfileDigest:'a'.repeat(64),...overrides})
}

test('native record command verifies real bytes, scope, exact replay and owner boundary through the sole writer',async()=>{
 const state=await fixture(),root=join(state,'amirahco-cli','projects'),workspace=join(state,'workspace'),id=randomUUID(),store=new IntakeStore(root),oldState=process.env.XDG_STATE_HOME
 process.env.XDG_STATE_HOME=state
 try{
  await mkdir(workspace);await writeFile(join(workspace,'result.txt'),'actual bytes')
  await store.save(mutation(id));await store.prd(await prdRequest(store,id));await approvePrd(store,id)
  const active=await activateProject(store,id,{workspaceRoot:workspace})
  const input={projectId:id,operationId:randomUUID(),recordId:randomUUID(),sessionId:active.activation.nativeSessionId,expectedSequence:active.sequence,type:'artifact',artifactId:randomUUID(),kind:'file',relativeLocator:'result.txt',byteLength:12,sha256:createHash('sha256').update('actual bytes').digest('hex'),classification:'private',links:[]}
  const file=join(state,'record.json');await writeFile(file,JSON.stringify(input))
  const saved=await projectRecordsCommand(['record',id,file]);assert.equal(saved.operation.type,'artifact')
  assert.equal((await projectRecordsCommand(['record',id,file])).operation.recordId,saved.operation.recordId)
  assert.equal((await projectRecordsCommand(['completion',id])).artifactIds.length,1)
  assert.equal((await projectRecordsCommand(['read',id])).projectId,id)
  const criterion=active.prd.records.find(row=>row.kind==='criterion')
  const check={projectId:id,operationId:randomUUID(),recordId:randomUUID(),sessionId:active.activation.nativeSessionId,expectedSequence:active.sequence,type:'check',criterionId:criterion.id,criterionRevision:criterion.revision,artifactIds:[input.artifactId],checker:'fixture-tool',method:'tool_check',inputHashes:['0'.repeat(64)],outcome:'pass',evidenceRefs:['fixture:performed-check'],links:[]}
  await writeFile(file,JSON.stringify(check));await assert.rejects(()=>projectRecordsCommand(['record',id,file]),/exact recorded artifact hashes/)
  await writeFile(file,JSON.stringify({...check,inputHashes:[input.sha256]}));await projectRecordsCommand(['record',id,file])
  await writeFile(join(workspace,'result.txt'),'changed bytes')
  await writeFile(file,JSON.stringify({...check,operationId:randomUUID(),recordId:randomUUID(),inputHashes:[input.sha256]}))
  await assert.rejects(()=>projectRecordsCommand(['record',id,file]),/bytes changed/)
  await writeFile(join(workspace,'result.txt'),'actual bytes')
  await writeFile(file,JSON.stringify({...input,operationId:randomUUID(),recordId:randomUUID(),artifactId:randomUUID(),sha256:'0'.repeat(64)}))
  await assert.rejects(()=>projectRecordsCommand(['record',id,file]),/bytes changed/)
  const outside=join(state,'outside');await mkdir(outside);await writeFile(join(outside,'outside.txt'),'actual bytes')
  await symlink(outside,join(workspace,'escape'),process.platform==='win32'?'junction':'dir')
  await writeFile(file,JSON.stringify({...input,operationId:randomUUID(),recordId:randomUUID(),artifactId:randomUUID(),relativeLocator:'escape/outside.txt'}))
  await assert.rejects(()=>projectRecordsCommand(['record',id,file]),/outside/)
  await writeFile(file,JSON.stringify({projectId:id,operationId:randomUUID(),recordId:randomUUID(),sessionId:active.activation.nativeSessionId,expectedSequence:active.sequence,type:'acceptance',actor:'owner',decision:'accept',reviewId:randomUUID(),reviewRevision:1,scope:'all',links:[]}))
  await assert.rejects(()=>projectRecordsCommand(['record',id,file]),/impersonate/)
  assert.equal((await projectRecordsCommand(['completion',id])).artifactIds.length,1)
 }finally{await store.close();if(oldState===undefined)delete process.env.XDG_STATE_HOME;else process.env.XDG_STATE_HOME=oldState}
})

test('prepared result submissions supply stable identities, exact criteria, actual hashes and self-review without owner acceptance',async()=>{
 const state=await fixture(),root=join(state,'amirahco-cli','projects'),workspace=join(state,'workspace'),id=randomUUID(),store=new IntakeStore(root),oldState=process.env.XDG_STATE_HOME
 process.env.XDG_STATE_HOME=state
 try{
  await mkdir(workspace);await writeFile(join(workspace,'result.txt'),'verified');await writeFile(join(workspace,'test.log'),'fixture actually inspected result bytes')
  await store.save(mutation(id));const candidate=await prdRequest(store,id);candidate.draft.requirements[0].criteria[0].method='tool_check';await store.prd(candidate);await approvePrd(store,id);await activateProject(store,id,{workspaceRoot:workspace})
  await projectRecordsCommand(['prepare',id,'submission.json'])
  const file=join(workspace,'submission.json'),input=JSON.parse(await readFile(file,'utf8'))
  await assert.rejects(()=>projectRecordsCommand(['prepare',id,'submission.json']),{code:'EEXIST'})
  input.artifacts=['result.txt'];input.checks=[{criterionKey:'R1-C1',artifactPaths:['result.txt'],evidencePaths:['test.log'],method:'fixture:inspect actual bytes',outcome:'pass'}];input.selfReview=true
  await writeFile(file,JSON.stringify(input))
  const interrupted=new IntakeStore(root,'submission_after_intent_exit')
  try{await assert.rejects(()=>submitResult(interrupted,id,'submission.json'),{code:'UNKNOWN'})}finally{await interrupted.close()}
  assert.equal((await store.completion(id)).artifactIds.length,0)
  const receipt=await projectRecordsCommand(['submit',id,'submission.json'])
  assert.equal(receipt.completion.satisfiedCriteria.length,1);assert.equal(receipt.completion.artifactIds.length,2);assert.equal(receipt.completion.checkIds.length,1)
  assert.deepEqual(receipt.completion.blockers,['missing current owner/required acceptance'])
  const retry=await projectRecordsCommand(['submit',id,'submission.json'])
  assert.deepEqual(retry.artifactIds,receipt.artifactIds);assert.deepEqual(retry.checkIds,receipt.checkIds);assert.equal(retry.reviewId,receipt.reviewId);assert.equal(retry.completion.checkIds.length,1)
  await writeFile(join(workspace,'result.txt'),'changed')
  await assert.rejects(()=>projectRecordsCommand(['submit',id,'submission.json']),{code:'CONFLICT'})
  await writeFile(join(workspace,'result.txt'),'verified')
  await writeFile(file,JSON.stringify({...input,checks:[{...input.checks[0],outcome:'fail'}]}))
  await assert.rejects(()=>projectRecordsCommand(['submit',id,'submission.json']),{code:'CONFLICT'})
  await writeFile(file,JSON.stringify({...input,context:{...input.context,intakeSequence:input.context.intakeSequence+1}}))
  await assert.rejects(()=>projectRecordsCommand(['submit',id,'submission.json']),/context changed/)
  await writeFile(file,JSON.stringify({...input,checks:[{...input.checks[0],criterionKey:'R9-C1'}],selfReview:false}))
  await assert.rejects(()=>projectRecordsCommand(['submit',id,'submission.json']),/Unknown current criterion/)
  assert.equal((await store.completion(id)).checkIds.length,1)
 }finally{await store.close();if(oldState===undefined)delete process.env.XDG_STATE_HOME;else process.env.XDG_STATE_HOME=oldState}
})

test('Build activates only the exact approved PRD and creates a current non-authorizing context packet',async()=>{
 const root=await fixture(),id=randomUUID(),store=new IntakeStore(root)
 try{
  await store.save(mutation(id));await store.prd(await prdRequest(store,id))
  await assert.rejects(()=>activateProject(store,id),{code:'PRD_REVIEW'})
  const approved=await approvePrd(store,id)
  await assert.rejects(()=>activateProject(store,id,{reviewedMeaningHash:'0'.repeat(64)}),{code:'STALE_PRD'})
  const stopped=await store.save(mutation(id,{create:false,type:'stop',expectedSequence:approved.sequence,answers:approved.answers,step:approved.step,phase:approved.phase}))
  await assert.rejects(()=>activateProject(store,id),{code:'STOPPED'})
  const resumed=await store.save(mutation(id,{create:false,type:'resume',expectedSequence:stopped.sequence,answers:stopped.answers,step:stopped.step,phase:stopped.phase}))
  const operationId=randomUUID(),request={projectId:id,operationId,sessionId:'native-build-fixture',type:'activate',expectedSequence:resumed.sequence,expectedPlanRevision:resumed.prd.revision,reviewedMeaningHash:resumed.prd.meaningHash,selectedTotal:1,workspaceRoot:process.platform==='win32'?await fixture():'/workspace/bakery',nativeSessionId:'native-build-fixture',capabilityProfileDigest:'a'.repeat(64)}
  const activated=await store.activate(request)
  assert.equal(activated.activation.planRevision,activated.prd.revision)
  assert.equal(activated.activation.meaningHash,activated.prd.meaningHash)
  assert.equal(activated.activation.selectedTotal,1)
  assert.match(activated.activation.contextDigest,/^[0-9a-f]{64}$/)
  assert.equal((await store.activate(request)).activation.activationId,activated.activation.activationId)
  await assert.rejects(()=>store.activate({...request,selectedTotal:2}),{code:'CONFLICT'})
  await assert.rejects(()=>activateProject(store,id),{code:'ALREADY_ACTIVE'})
  const reopened=await store.read(id);assert.deepEqual(reopened.activation,activated.activation)
 }finally{await store.close()}
})

test('typed project records bind run, artifact, check, review, acceptance, incident and lesson without raw SQL',async()=>{
 const root=await fixture(),id=randomUUID(),store=new IntakeStore(root),sessionId='project-record-fixture'
 try{
  await store.save(mutation(id));await store.prd(await prdRequest(store,id));await approvePrd(store,id);const active=await activateProject(store,id)
  assert.equal((await store.completion(id)).ready,false)
  const base={projectId:id,sessionId,expectedSequence:active.sequence}
  const run=await store.record({...base,type:'run_binding',operationId:randomUUID(),recordId:randomUUID(),activationId:active.activation.activationId,runId:active.activation.activationId,nativeSessionId:active.activation.nativeSessionId,contextDigest:active.activation.contextDigest,profileDigest:active.activation.capabilityProfileDigest,links:[]})
  assert.equal(run.operation.type,'run_binding')
  const artifactId=randomUUID(),artifactRecordId=randomUUID(),bytes=createHash('sha256').update('artifact').digest('hex')
  const artifact=await store.record({...base,type:'artifact',operationId:randomUUID(),recordId:artifactRecordId,artifactId,kind:'file',relativeLocator:'src/menu.html',byteLength:8,sha256:bytes,classification:'private-project',links:[]})
  const criterion=artifact.prd.records.find(record=>record.kind==='criterion'),checkId=randomUUID()
  await store.record({...base,type:'check',operationId:randomUUID(),recordId:checkId,criterionId:criterion.id,criterionRevision:criterion.revision,artifactIds:[artifactId],checker:sessionId,method:'render-and-inspect',inputHashes:[bytes],outcome:'pass',evidenceRefs:['local:test-receipt'],links:[]})
  const reviewId=randomUUID(),review=await store.record({...base,type:'review',operationId:randomUUID(),recordId:reviewId,reviewer:'owner',criteriaRevision:`${criterion.id}@${criterion.revision}`,artifactIds:[artifactId],checkIds:[checkId],inputHashes:[bytes],verdict:'pass',findings:[],independence:'owner',links:[]})
  await store.record({...base,type:'acceptance',operationId:randomUUID(),recordId:randomUUID(),actor:'owner',decision:'accept',reviewId,reviewRevision:review.operation.recordRevision,scope:'R1-C1 only',links:[]})
  const incidentId=randomUUID(),incident=await store.record({...base,type:'incident',operationId:randomUUID(),recordId:incidentId,failureClass:'observed-test-failure',observedEvidence:['check initially failed before repair'],impact:'Blocked acceptance until repaired.',preventionEvidence:['regression check added'],links:[]})
  await store.record({...base,type:'lesson',operationId:randomUUID(),recordId:randomUUID(),incidentId,incidentRevision:incident.operation.recordRevision,prevention:'Run the regression check before review.',status:'activated',links:[]})
  const complete=await store.completion(id);assert.equal(complete.ready,true,JSON.stringify(complete));assert.equal(complete.blockers.length,0);assert.equal(complete.satisfiedCriteria.length,1)
  assert.throws(()=>store.record({...base,type:'artifact',operationId:randomUUID(),recordId:randomUUID(),artifactId:randomUUID(),kind:'file',relativeLocator:'../escape',byteLength:0,sha256:'a'.repeat(64),classification:'private',links:[]}),/Artifact locator/)
 }finally{await store.close()}
})

test('PRD records, bidirectional criterion links and exact Markdown persist; approval never activates work',async()=>{
 const root=await fixture(),id=randomUUID();let store=new IntakeStore(root)
 try{
  await store.save(mutation(id));const candidate=await prdRequest(store,id),saved=await store.prd(candidate)
  assert.equal(saved.prd.revision,1);assert.equal(saved.prd.approved,false);assert.equal(saved.prd.projectionPending,false)
  const requirement=saved.prd.records.find(r=>r.key==='R1'),criterion=saved.prd.records.find(r=>r.key==='R1-C1')
  assert.equal(requirement.kind,'requirement');assert.equal(criterion.kind,'criterion')
  assert.equal(requirement.body.outcome,candidate.draft.requirements[0].outcome)
  assert.ok(requirement.links.some(l=>l.relation==='has_criterion'&&l.to_id===criterion.id&&l.to_revision===criterion.revision))
  assert.ok(criterion.links.some(l=>l.relation==='criterion_for'&&l.to_id===requirement.id&&l.to_revision===requirement.revision))
  const bytes=await readFile(join(root,id,'PRD.md'),'utf8')
  assert.match(bytes,/No payments/);assert.match(bytes,/not yet performed/);assert.ok(bytes.includes(saved.prd.meaningHash))
  assert.equal(bytes,await readFile(join(root,id,`PRD.${saved.prd.commitSequence}.md`),'utf8'))
  await assert.rejects(()=>store.prd({projectId:id,operationId:randomUUID(),sessionId:'owner-review',type:'prd_approve',expectedSequence:saved.sequence,expectedPlanRevision:1,requestId:saved.prdRequest.requestId,reviewedMeaningHash:'0'.repeat(64)}),{code:'STALE_PRD'})
  const approved=await approvePrd(store,id);assert.equal(approved.prd.approved,true);assert.equal(approved.prd.activationCount,0)
  await store.close();store=new IntakeStore(root)
  const reopened=await store.read(id);assert.equal(reopened.prd.approved,true);assert.equal(reopened.prd.meaningHash,saved.prd.meaningHash)
  const resumed=new NativeIntakeSession(store,'reopened-native-owner');await resumed.open(id);await resumed.resume()
  assert.equal(resumed.snapshot.prd.approved,true);assert.equal(resumed.snapshot.prd.activationCount,0)
 }finally{await store.close()}
})

test('new owner changes block old approval; revised scope keeps record identity and needs its own approval',async()=>{
 const root=await fixture(),id=randomUUID(),store=new IntakeStore(root)
 try{
  await store.save(mutation(id));await store.prd(await prdRequest(store,id));const first=await approvePrd(store,id)
  const candidate=await prdRequest(store,id,'Also show opening hours, still no payments.')
  assert.equal((await store.read(id)).prd.approved,false)
  await assert.rejects(()=>approvePrd(store,id),{code:'PRD_REVIEW'})
  candidate.draft.summary='Menu and opening hours; no payments.'
  candidate.draft.requirements.push({key:'R2',outcome:'Show opening hours',scope:'required',priority:'medium',exclusions:[],openQuestions:[],sourceFields:['change'],criteria:[{key:'C1',description:'Owner sees correct hours',method:'owner_review',blocking:true}]})
  const second=await store.prd(candidate);assert.equal(second.prd.revision,2);assert.equal(second.prd.approved,false)
  assert.equal(first.prd.records.find(r=>r.key==='R1').id,second.prd.records.find(r=>r.key==='R1').id)
  assert.equal(second.prd.records.find(r=>r.key==='R1').revision,2)
  await assert.rejects(()=>store.prd({...candidate,type:'prd_approve',operationId:randomUUID(),draft:undefined,reviewedMeaningHash:first.prd.meaningHash}),{code:'STALE_PRD'})
  assert.equal((await approvePrd(store,id)).prd.approved,true)
  assert.equal(await readFile(join(root,id,`PRD.${first.prd.commitSequence}.md`),'utf8').then(x=>x.includes('Revision: 1')),true)
 }finally{await store.close()}
})

test('intake edits and superseding requests reject stale candidate output',async()=>{
 const root=await fixture(),id=randomUUID(),store=new IntakeStore(root)
 try{
  const initial=await store.save(mutation(id)),old=await prdRequest(store,id)
  await store.save(mutation(id,{create:false,expectedSequence:initial.sequence,answers:{needs:'Menu and hours. No payments.'}}))
  await assert.rejects(()=>store.prd(old),{code:'STALE'})
  const newer=await prdRequest(store,id),latest=await prdRequest(store,id)
  await assert.rejects(()=>store.prd(newer),{code:'STALE_PRD'})
  assert.equal((await store.prd(latest)).prd.revision,1)
  const current=await store.read(id);await store.save(mutation(id,{create:false,expectedSequence:current.sequence,answers:{success:'Menu must work offline'}}))
  assert.equal((await store.read(id)).prd.stale,true)
  await assert.rejects(()=>approvePrd(store,id),{code:'STALE_PRD'})
 }finally{await store.close()}
})

test('material gaps block approval and model-supplied approval/control fields are rejected',async()=>{
 const root=await fixture(),id=randomUUID(),store=new IntakeStore(root)
 try{
  await store.save(mutation(id));const candidate=await prdRequest(store,id)
  assert.throws(()=>store.prd({...candidate,draft:{...candidate.draft,approved:true}}))
  candidate.draft.openQuestions=['Who updates the menu?'];await store.prd(candidate)
  await assert.rejects(()=>approvePrd(store,id),{code:'PRD_GAPS'})
  const invalid=await prdRequest(store,id);invalid.draft.requirements[0].sourceFields=['notes']
  await assert.rejects(()=>store.prd(invalid),{code:'PRD_SOURCE'})
  assert.equal((await store.read(id)).prd.activationCount,0)
 }finally{await store.close()}
})

for(const fault of ['prd_before_projection','prd_after_projection'])test(`PRD publication repairs saved bytes after ${fault} without another candidate`,async()=>{
 const root=await fixture(),id=randomUUID();let store=new IntakeStore(root)
 try{
  await store.save(mutation(id));const candidate=await prdRequest(store,id);await store.close();store=new IntakeStore(root,fault)
  const pending=await store.prd(candidate);assert.equal(pending.prd.projectionPending,true)
  await assert.rejects(()=>approvePrd(store,id),{code:'PRD_REVIEW'})
  await store.close();store=new IntakeStore(root)
  const fixed=await store.repair(id);assert.equal(fixed.prd.projectionPending,false);assert.equal(fixed.prd.revision,1)
  assert.equal(fixed.prd.meaningHash,pending.prd.meaningHash);assert.equal((await approvePrd(store,id)).prd.approved,true)
 }finally{await store.close()}
})

for(const fault of ['prd_during_transaction','prd_after_commit_exit'])test(`original PRD operation reconciles after ${fault}`,async()=>{
 const root=await fixture(),id=randomUUID();let store=new IntakeStore(root)
 try{
  await store.save(mutation(id));const candidate=await prdRequest(store,id);await store.close();store=new IntakeStore(root,fault)
  await assert.rejects(()=>store.prd(candidate),{code:'UNKNOWN'});await store.close();store=new IntakeStore(root)
  const before=await store.read(id)
  assert.equal(Boolean(before.prd),fault==='prd_after_commit_exit')
  const recovered=await store.prd(candidate);assert.equal(recovered.prd.revision,1);assert.equal(recovered.prd.projectionPending,false)
  assert.equal((await store.prd(candidate)).prd.revision,1)
  await assert.rejects(()=>store.prd({...candidate,draft:{...candidate.draft,summary:'Different bytes with reused identity'}}),{code:'CONFLICT'})
 }finally{await store.close()}
})

test('manual PRD edits survive new candidates and block approval until reconciled',async()=>{
 const root=await fixture(),id=randomUUID(),store=new IntakeStore(root)
 try{
  await store.save(mutation(id));await store.prd(await prdRequest(store,id))
  await writeFile(join(root,id,'PRD.md'),'A manual document that must survive')
  const candidate=await prdRequest(store,id,'Add opening hours');candidate.draft.summary='Updated hours'
  const result=await store.prd(candidate);assert.equal(result.prd.projectionPending,true)
  assert.equal(await readFile(join(root,id,'PRD.md'),'utf8'),'A manual document that must survive')
  await assert.rejects(()=>store.repair(id),{code:'PROJECTION_CONFLICT'})
  await assert.rejects(()=>approvePrd(store,id),{code:'PRD_REVIEW'})
 }finally{await store.close()}
})

test('Stop fences PRD output and approval; explicit Resume preserves reviewed scope without activating work',async()=>{
 const root=await fixture(),store=new IntakeStore(root),session=new NativeIntakeSession(store,'prd-live-owner')
 try{
  await session.save({idea:'Bakery menu',needs:'No payments',success:'Phone readable'},6,'review')
  const requestId=randomUUID();await session.prd('prd_request',requestId,'');await session.prd('prd_candidate',requestId,undefined,draft())
  await session.prd('prd_approve',requestId)
  session.requestStop();assert.throws(()=>session.prd('prd_approve',requestId),{code:'STOPPED'})
  await session.stop(session.snapshot.answers,6)
  await assert.rejects(()=>approvePrd(store,session.projectId),{code:'STOPPED'})
  const meaning=session.snapshot.prd.meaningHash;await session.resume()
  assert.equal(session.snapshot.prd.meaningHash,meaning);assert.equal(session.snapshot.prd.approved,true)
  assert.equal(session.snapshot.prd.activationCount,0)
 }finally{await store.close()}
})

test('SQLite FULL during PRD save leaves no partial plan or activation',async()=>{
 const root=await fixture(),id=randomUUID();let store=new IntakeStore(root)
 try{
  await store.save(mutation(id));const candidate=await prdRequest(store,id)
  candidate.draft.requirements[0].exclusions=Array.from({length:12},()=> 'x'.repeat(1900))
  await store.close();store=new IntakeStore(root,'prd_sqlite_full')
  await assert.rejects(()=>store.prd(candidate));await store.close();store=new IntakeStore(root)
  assert.equal((await store.read(id)).prd,undefined)
  assert.equal((await store.prd(candidate)).prd.revision,1)
 }finally{await store.close()}
})

test('native session discovery reads original intake provenance and preserves Stop across reopen',async()=>{
 const root=await fixture(),id=randomUUID();let store=new IntakeStore(root)
 try{
  const saved=await store.save(mutation(id,{sessionId:'original-native-session'}))
  await store.save(mutation(id,{sessionId:'original-native-session',type:'stop',create:false,expectedSequence:saved.sequence}))
  await store.close();store=new IntakeStore(root)
  assert.deepEqual((await store.read(id)).sessionIds,['original-native-session'])
  assert.match(await savedIntakeBlockerForSession('original-native-session',store),/stopped/)
  assert.equal(await savedIntakeBlockerForSession('unrelated-native-session',store),undefined)
  const session=new NativeIntakeSession(store,'recovery-native-session');await session.open(id);await session.resume()
  assert.equal(await savedIntakeBlockerForSession('original-native-session',store),undefined)
  assert.deepEqual(new Set((await store.read(id)).sessionIds),new Set(['original-native-session','recovery-native-session']))
 }finally{await store.close()}
})

test('real worker saves, reopens and edits the same identity; duplicates reconcile original result',async()=>{
 const root=await fixture(),id=randomUUID(),first=mutation(id);let store=new IntakeStore(root)
 try{
  const saved=await store.save(first);assert.equal(saved.projectionPending,false);assert.equal(saved.answers.helpers,'1')
  const repeated=await store.save(first);assert.equal(repeated.operation.sequence,saved.operation.sequence)
  await assert.rejects(()=>store.save({...first,answers:{idea:'different'}}),{code:'CONFLICT'})
  await store.close();store=new IntakeStore(root)
  const reopened=await store.read(id);assert.equal(reopened.projectId,id);assert.deepEqual(reopened.answers,first.answers)
  const edited=await store.save(mutation(id,{create:false,expectedSequence:reopened.sequence,answers:{...reopened.answers,needs:'No payments or accounts'}}))
  assert.ok(edited.sequence>reopened.sequence);assert.equal(edited.answers.needs,'No payments or accounts')
  assert.match(await readFile(join(root,id,`INTAKE.${edited.sequence}.md`),'utf8'),/No payments or accounts/)
  await assert.rejects(()=>store.save(mutation(id,{create:false,expectedSequence:reopened.sequence})),{code:'STALE'})
  if(process.platform!=='win32')assert.equal((await stat(join(root,id,'project-records.sqlite'))).mode&0o777,0o600) // Windows permissions are verified by the native ACL boundary.
 }finally{await store.close()}
})
test('missing, wrong-project and linked files are unavailable and never initialized on reopen',async()=>{
 const root=await fixture(),store=new IntakeStore(root),id=randomUUID()
 try{
  await assert.rejects(()=>store.read(id));await assert.rejects(()=>stat(join(root,id)))
  await store.save(mutation(id));const wrong=randomUUID();await mkdir(join(root,wrong));await copyFile(join(root,id,'project-records.sqlite'),join(root,wrong,'project-records.sqlite'))
  await assert.rejects(()=>store.read(wrong),{code:'IDENTITY'})
  const linked=randomUUID();await symlink(join(root,id),join(root,linked),process.platform==='win32'?'junction':'dir');await assert.rejects(()=>store.read(linked),{code:'UNSAFE_PATH'})
  assert.equal((await store.read(id)).answers.idea,'A bakery menu')
 }finally{await store.close()}
})
test('worker interruption during a transaction retains the prior complete revision',async()=>{
 const root=await fixture(),id=randomUUID();let store=new IntakeStore(root)
 const saved=await store.save(mutation(id));await store.close();store=new IntakeStore(root,'during_transaction')
 await assert.rejects(()=>store.save(mutation(id,{create:false,expectedSequence:saved.sequence,answers:{idea:'uncommitted'}})),{code:'UNKNOWN'});await store.close()
 store=new IntakeStore(root)
 try{const current=await store.read(id);assert.equal(current.sequence,saved.sequence);assert.equal(current.answers.idea,'A bakery menu')}finally{await store.close()}
})
test('exit after commit recovers original outcome and repairs bytes without new save identity',async()=>{
 const root=await fixture(),id=randomUUID(),request=mutation(id);let store=new IntakeStore(root,'after_commit_exit')
 await assert.rejects(()=>store.save(request),{code:'UNKNOWN'});await store.close();store=new IntakeStore(root)
 try{
  const interrupted=await store.read(id);assert.equal(interrupted.projectionPending,true)
  const recovered=await store.save(request);assert.equal(recovered.operation.sequence,interrupted.sequence);assert.equal(recovered.projectionPending,false)
 }finally{await store.close()}
})
for(const fault of ['before_projection','after_projection'])test(`exact projection repair after ${fault}; user changes are preserved`,async()=>{
 const root=await fixture(),id=randomUUID();let store=new IntakeStore(root,fault)
 const result=await store.save(mutation(id));assert.equal(result.projectionPending,true);await store.close();store=new IntakeStore(root)
 try{
  const fixed=await store.repair(id);assert.equal(fixed.projectionPending,false);assert.equal(fixed.sequence,result.sequence)
  const file=join(root,id,`INTAKE.${fixed.sequence}.md`);await writeFile(file,'Manual edit that must survive')
  await assert.rejects(()=>store.repair(id),{code:'PROJECTION_CONFLICT'})
  assert.equal(await readFile(file,'utf8'),'Manual edit that must survive')
 }finally{await store.close()}
})
test('live Stop wins over pending save; restart and ordinary edits never clear it',async()=>{
 const root=await fixture(),store=new IntakeStore(root),session=new NativeIntakeSession(store,'real-ui-fixture-session')
 try{
  const saving=session.save({idea:'A local project'},2)
  const stopping=session.stop({idea:'A local project'},2)
  assert.equal(session.isStopped,true);assert.ok(intakeWorkHoldReason('real-ui-fixture-session'))
  await saving;const stopped=await stopping;assert.equal(stopped.stopped,true)
  assert.equal(stopped.answers.idea,'A local project');assert.equal(stopped.step,2)
  const edited=await session.save({idea:'Edited while paused'},2);assert.equal(edited.stopped,true)
  const other=new NativeIntakeSession(store,'new-native-session');await other.open(session.projectId);assert.equal(other.snapshot.stopped,true);assert.ok(intakeWorkHoldReason('new-native-session'))
  await other.resume();assert.equal(other.isStopped,false);assert.equal((await store.read(session.projectId)).stopped,false)
 }finally{await store.close()}
})
test('Stop remains live if storage fails; new Stop defeats an already prepared Resume',async()=>{
 const root=await fixture(),normal=new IntakeStore(root),id=randomUUID();const saved=await normal.save(mutation(id));await normal.close()
 const broken=new IntakeStore(root,'before_commit'),session=new NativeIntakeSession(broken,'fixture')
 try{await session.open(id);await assert.rejects(()=>session.stop(saved.answers,saved.step));assert.equal(session.isStopped,true);assert.ok(intakeWorkHoldReason('fixture'))}finally{await broken.close()}
 const store=new IntakeStore(root),recovery=new NativeIntakeSession(store,'recovery')
 try{await recovery.open(id);const resume=recovery.resume();recovery.requestStop();await resume;assert.equal(recovery.isStopped,true);assert.ok(intakeWorkHoldReason('recovery'))}finally{await store.close()}
})
test('typed boundary rejects unknown keys, booleans, oversize text and unsafe counts before any files',async()=>{
 const root=await fixture(),store=new IntakeStore(root)
 try{
  for(const input of [mutation(randomUUID(),{expectedSequence:true}),mutation(randomUUID(),{extra:'SQL'}),mutation(randomUUID(),{answers:{idea:'x'.repeat(32769)}}),mutation(randomUUID(),{answers:{helpers:'9007199254740992'}})])await assert.rejects(async()=>store.save(input))
  assert.deepEqual(await store.list(),[])
 }finally{await store.close()}
})

test('SQLite FULL rolls back a bounded fixture save without filling a real volume',async()=>{
 const root=await fixture(),id=randomUUID();let store=new IntakeStore(root)
 const saved=await store.save(mutation(id));await store.close();store=new IntakeStore(root,'sqlite_full')
 try{await assert.rejects(()=>store.save(mutation(id,{create:false,expectedSequence:saved.sequence,answers:{notes:'x'.repeat(32768)}})));assert.equal((await store.read(id)).sequence,saved.sequence)}finally{await store.close()}
 store=new IntakeStore(root)
 try{assert.equal((await store.read(id)).answers.notes,undefined);const session=new NativeIntakeSession(store,'after-full-restart');await session.open(id);assert.equal(session.isStopped,true);await session.resume();assert.equal(session.isStopped,false)}finally{await store.close()}
})

test('two writers reject stale intake and retain immutable matching views',async()=>{
 const root=await fixture(),id=randomUUID(),a=new IntakeStore(root),b=new IntakeStore(root)
 try{
  const first=await a.save(mutation(id)),same=await b.read(id)
  const races=await Promise.allSettled([a.save(mutation(id,{create:false,expectedSequence:first.sequence,answers:{idea:'writer A'}})),b.save(mutation(id,{create:false,expectedSequence:same.sequence,answers:{idea:'writer B'}}))])
  assert.equal(races.filter(x=>x.status==='fulfilled').length,1,JSON.stringify(races.map(x=>x.status==='rejected'?{status:x.status,code:x.reason.code,message:x.reason.message}:{status:x.status})))
  assert.equal(races.filter(x=>x.status==='rejected'&&x.reason.code==='STALE').length,1,JSON.stringify(races.map(x=>x.status==='rejected'?{status:x.status,code:x.reason.code,message:x.reason.message}:{status:x.status})))
  const current=await a.read(id);await a.repair(id)
  assert.match(await readFile(join(root,id,`INTAKE.${current.sequence}.md`),'utf8'),new RegExp(current.answers.idea))
  assert.match(await readFile(join(root,id,`INTAKE.${first.sequence}.md`),'utf8'),/A bakery menu/)
 }finally{await a.close();await b.close()}
})

test('the same native intake view reconciles an exited writer and retains its original save',async()=>{
 const root=await fixture(),store=new IntakeStore(root,'after_commit_exit'),session=new NativeIntakeSession(store,'ui-retry-fixture')
 try{
  await assert.rejects(()=>session.save({idea:'Keep the original action'},2),{code:'UNKNOWN'})
  const original={...session.pending}
  const recovered=await session.retry()
  assert.equal(recovered.operation.publicationId.length,36);assert.equal(recovered.answers.idea,'Keep the original action');assert.equal(session.pending,undefined)
  assert.equal((await store.read(session.projectId)).sequence,recovered.operation.sequence)
  assert.ok(original.operationId)
 }finally{await store.close()}
})

const clarification=(answers,status='requested',responses={})=>JSON.stringify({version:1,inputHash:createHash('sha256').update(JSON.stringify(Object.fromEntries(['idea','needs','success','notes'].map(k=>[k,String(answers[k]??'')])))).digest('hex'),status,attempts:1,requestId:randomUUID(),questions:status==='requested'?[]:[{intent:'content-owner',question:'Who updates the menu?',why:'Editing depends on who maintains the content.',basedOn:['idea','needs']}],responses})
test('real clarification state and raw responses survive Stop, reopen and explicit Resume',async()=>{
 const root=await fixture(),id=randomUUID(),base=mutation(id).answers;let store=new IntakeStore(root)
 try{
  let saved=await store.save(mutation(id,{step:12,phase:'intake',clarification:clarification(base)}))
  saved=await store.save(mutation(id,{create:false,expectedSequence:saved.sequence,step:12,phase:'intake',origin:'application',clarification:clarification(base,'ready')}))
  saved=await store.save(mutation(id,{create:false,expectedSequence:saved.sequence,step:5,phase:'intake',clarification:clarification(base,'done',{'content-owner':'The owner'})}))
  const stopped=await store.save(mutation(id,{create:false,expectedSequence:saved.sequence,type:'stop',step:5,phase:'intake'}))
  assert.equal(JSON.parse(stopped.clarification).responses['content-owner'],'The owner');assert.equal(stopped.stopped,true)
  await store.close();store=new IntakeStore(root);const session=new NativeIntakeSession(store,'clarification-reopen');await session.open(id);const resumed=await session.resume()
  assert.equal(resumed.step,5);assert.equal(resumed.stopped,false);assert.equal(JSON.parse(resumed.clarification).responses['content-owner'],'The owner')
  assert.match(await readFile(join(root,id,`INTAKE.${saved.sequence}.md`),'utf8'),/Personalized clarification draft/)
 }finally{await store.close()}
})
test('application question output cannot overwrite owner data, invent answers or attach to changed facts',async()=>{
 const root=await fixture(),id=randomUUID(),store=new IntakeStore(root),base=mutation(id).answers
 try{
  let saved=await store.save(mutation(id,{step:12,phase:'intake',clarification:clarification(base)}))
  await assert.rejects(()=>store.save(mutation(id,{create:false,expectedSequence:saved.sequence,origin:'application',answers:{...base,idea:'Changed by model'},clarification:clarification(base,'ready')})),{code:'AUTHORITY'})
  await assert.rejects(()=>store.save(mutation(id,{create:false,expectedSequence:saved.sequence,origin:'application',clarification:clarification(base,'done',{'content-owner':'Invented'})})),{code:'AUTHORITY'})
  saved=await store.save(mutation(id,{create:false,expectedSequence:saved.sequence,answers:{...base,needs:'Different app'}}))
  await assert.rejects(()=>store.save(mutation(id,{create:false,expectedSequence:saved.sequence,answers:{...base,needs:'Different app'},origin:'application',clarification:clarification(base,'ready')})),{code:'STALE_CONTEXT'})
  assert.equal((await store.read(id)).answers.needs,'Different app')
 }finally{await store.close()}
})

test('interrupted model-result save retries its original local candidate without generating questions again',async()=>{
 const root=await fixture(),id=randomUUID(),base=mutation(id).answers;let store=new IntakeStore(root)
 let saved=await store.save(mutation(id,{step:12,phase:'intake',clarification:clarification(base)}));await store.close();store=new IntakeStore(root,'during_transaction')
 const session=new NativeIntakeSession(store,'model-save-recovery');await session.open(id);await session.resume()
 await assert.rejects(()=>session.save(base,12,'intake',clarification(base,'ready'),'application'),{code:'UNKNOWN'})
 const original={...session.pending}
 try{const recovered=await session.retry();const repeated=await store.save(original);assert.deepEqual(repeated.operation,recovered.operation);assert.equal(JSON.parse(recovered.clarification).status,'ready');assert.equal(session.pending,undefined);assert.ok(original.operationId)}finally{await store.close()}
})

test('applied owner changes remain actual linked sources after reopen, regeneration and later partial edits',async()=>{
 const root=await fixture(),id=randomUUID();let store=new IntakeStore(root)
 try{
  await store.save(mutation(id));await store.prd(await prdRequest(store,id))
  const changed=await prdRequest(store,id,'Use USD prices and no analytics');changed.draft.requirements[0].sourceFields=['change'];await store.prd(changed)
  await store.close();store=new IntakeStore(root);const before=await store.read(id)
  assert.deepEqual(before.prd.ownerChanges,['Use USD prices and no analytics'])
  const oldLinks=before.prd.records.find(r=>r.key==='R1').links.filter(l=>l.relation==='sourced_from')
  const regenerated=await prdRequest(store,id);regenerated.draft.requirements[0].sourceFields=['change'];const after=await store.prd(regenerated)
  assert.deepEqual(after.prd.ownerChanges,before.prd.ownerChanges)
  assert.deepEqual(after.prd.records.find(r=>r.key==='R1').links.filter(l=>l.relation==='sourced_from'),oldLinks)
  assert.match(await readFile(join(root,id,'PRD.md'),'utf8'),/Use USD prices and no analytics/)
  const partial=await prdRequest(store,id,'Also show opening hours');partial.draft.requirements[0].sourceFields=['change'];const latest=await store.prd(partial)
  assert.deepEqual(latest.prd.ownerChanges,['Use USD prices and no analytics','Also show opening hours'])
  assert.equal(latest.prd.records.find(r=>r.key==='R1').links.filter(l=>l.relation==='sourced_from').length,2)
  assert.equal((await approvePrd(store,id)).prd.approved,true)
 }finally{await store.close()}
})
