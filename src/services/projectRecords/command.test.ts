import {test,expect} from 'bun:test'
import {validateAgentRecord,projectRecordsCommand} from './command.js'
import type {IntakeSnapshot} from './intakeStore.js'
const id='7ae7811b-a8b8-448f-9a26-f4c156b39f31'
const snapshot={projectId:id,stopped:false,projectionPending:false,prd:{approved:true,stale:false,projectionPending:false,revision:2,meaningHash:'a'.repeat(64)},activation:{nativeSessionId:'lead',planRevision:2,meaningHash:'a'.repeat(64)}} as IntakeSnapshot
const request={projectId:id,operationId:id,sessionId:'lead',expectedSequence:1,type:'artifact',recordId:id,artifactId:id,kind:'file',relativeLocator:'tasks.js',byteLength:12,sha256:'b'.repeat(64),classification:'private',links:[]}
test('record help is available without Linux state, provider or credentials',async()=>{
 expect(await projectRecordsCommand(['--help'])).toHaveProperty('usage')
})
test('agent records require the exact current activated identity and controls',()=>{
 expect(validateAgentRecord(request,snapshot).type).toBe('artifact')
 for(const changed of [{...snapshot,stopped:true},{...snapshot,activation:undefined},{...snapshot,prd:{...snapshot.prd!,stale:true}},{...snapshot,prd:{...snapshot.prd!,revision:3}}])expect(()=>validateAgentRecord(request,changed)).toThrow()
 expect(()=>validateAgentRecord({...request,sessionId:'another-lead'},snapshot)).toThrow()
 expect(()=>validateAgentRecord({...request,relativeLocator:'../elsewhere'},snapshot)).toThrow()
})
test('agent records cannot manufacture owner acceptance or independent review',()=>{
 const base={projectId:id,operationId:id,recordId:id,sessionId:'lead',expectedSequence:1,links:[]}
 const review={...base,type:'review',reviewer:'lead',criteriaRevision:'2',artifactIds:[id],checkIds:[id],inputHashes:['b'.repeat(64)],verdict:'pass',findings:[],independence:'self_check'}
 expect(validateAgentRecord(review,snapshot).type).toBe('review')
 expect(()=>validateAgentRecord({...review,independence:'owner'},snapshot)).toThrow('impersonate')
 expect(()=>validateAgentRecord({...review,independence:'independent'},snapshot)).toThrow('impersonate')
 expect(()=>validateAgentRecord({...base,type:'acceptance',actor:'owner',decision:'accept',reviewId:id,reviewRevision:1,scope:'all'},snapshot)).toThrow('impersonate')
})
