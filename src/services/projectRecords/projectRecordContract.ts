import {z} from 'zod'

const digest=z.string().regex(/^[0-9a-f]{64}$/)
const common=z.object({projectId:z.string().uuid(),operationId:z.string().uuid(),sessionId:z.string().min(1).max(256),expectedSequence:z.number().int().safe().nonnegative()})
const ref=z.object({id:z.string().uuid(),revision:z.number().int().positive(),relation:z.string().min(1).max(64)}).strict()
const refs=z.array(ref).max(64).default([])
const bounded=z.string().min(1).max(8192)

export const projectRecordMutation=z.discriminatedUnion('type',[
  common.extend({type:z.literal('submission_intent'),recordId:z.string().uuid(),activationId:z.string().uuid(),submissionId:z.string().uuid(),serialized:z.string().min(1).refine(value=>Buffer.byteLength(value,'utf8')<=32768,'Submission intent exceeds 32 KiB; nothing was truncated.'),links:refs}).strict(),
  common.extend({type:z.literal('run_binding'),recordId:z.string().uuid(),activationId:z.string().uuid(),runId:bounded.max(256),nativeSessionId:bounded.max(256),contextDigest:digest,profileDigest:digest,links:refs}).strict(),
  common.extend({type:z.literal('artifact'),recordId:z.string().uuid(),artifactId:z.string().uuid(),kind:bounded.max(64),relativeLocator:bounded.max(4096).refine(value=>!value.startsWith('/')&&!/^[a-zA-Z]:[\\/]/.test(value)&&!value.split(/[\\/]/).includes('..'),'Artifact locator must stay relative.'),byteLength:z.number().int().safe().nonnegative(),sha256:digest,classification:bounded.max(64),links:refs}).strict(),
  common.extend({type:z.literal('check'),recordId:z.string().uuid(),criterionId:z.string().uuid(),criterionRevision:z.number().int().positive(),artifactIds:z.array(z.string().uuid()).min(1).max(64),checker:bounded.max(256),method:bounded.max(128),inputHashes:z.array(digest).min(1).max(64),outcome:z.enum(['pass','fail','blocked']),evidenceRefs:z.array(bounded.max(4096)).min(1).max(64),links:refs}).strict(),
  common.extend({type:z.literal('review'),recordId:z.string().uuid(),reviewer:bounded.max(256),criteriaRevision:bounded.max(256),artifactIds:z.array(z.string().uuid()).min(1).max(64),checkIds:z.array(z.string().uuid()).min(1).max(64),inputHashes:z.array(digest).min(1).max(64),verdict:z.enum(['pass','fail','blocked']),findings:z.array(bounded).max(64),independence:z.enum(['owner','independent','self_check']),links:refs}).strict(),
  common.extend({type:z.literal('acceptance'),recordId:z.string().uuid(),actor:bounded.max(256),decision:z.enum(['accept','reject','hold']),reviewId:z.string().uuid(),reviewRevision:z.number().int().positive(),scope:bounded.max(2048),links:refs}).strict(),
  common.extend({type:z.literal('requirement_change'),recordId:z.string().uuid(),changeId:z.string().uuid(),statement:bounded,basePlanRevision:z.number().int().positive(),order:z.number().int().safe().positive(),affectedRefs:z.array(bounded.max(256)).min(1).max(64),status:z.enum(['proposed','applied','superseded','rejected']),links:refs}).strict(),
  common.extend({type:z.literal('incident'),recordId:z.string().uuid(),failureClass:bounded.max(128),observedEvidence:z.array(bounded).min(1).max(64),impact:bounded,preventionEvidence:z.array(bounded).max(64),links:refs}).strict(),
  common.extend({type:z.literal('lesson'),recordId:z.string().uuid(),incidentId:z.string().uuid(),incidentRevision:z.number().int().positive(),prevention:bounded,status:z.enum(['proposed','activated','retired']),links:refs}).strict(),
])
export type ProjectRecordMutation=z.infer<typeof projectRecordMutation>
