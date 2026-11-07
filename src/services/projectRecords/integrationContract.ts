import {z} from 'zod'

export const starterCapabilityProfileDigest='ef2a054b0c095cf2d279d4735956bd625d8c27ce3f1538e00ed655106038a728'

const digest=z.string().regex(/^[0-9a-f]{64}$/)
export const activationMutation=z.object({
  projectId:z.string().uuid(),operationId:z.string().uuid(),sessionId:z.string().min(1).max(256),
  type:z.literal('activate'),expectedSequence:z.number().int().safe().nonnegative(),
  expectedPlanRevision:z.number().int().safe().positive(),reviewedMeaningHash:digest,
  selectedTotal:z.number().int().safe().positive().max(999),workspaceRoot:z.string().min(1).max(4096),
  nativeSessionId:z.string().min(1).max(256),capabilityProfileDigest:digest,
}).strict()
export type ActivationMutation=z.infer<typeof activationMutation>

export type ActivationState={
  activationId:string;revision:number;commitSequence:number;planRevision:number;meaningHash:string;
  selectedTotal:number;workspaceRoot:string;nativeSessionId:string;capabilityProfileDigest:string;
  contextPacketId:string;contextPacketRevision:number;contextDigest:string;status:'activated'
}
