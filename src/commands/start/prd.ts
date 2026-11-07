import {prdPrompt,prdDraft,type PrdDraft} from './prdContract.js'
import type {IntakeSnapshot} from '../../services/projectRecords/intakeStore.js'

export async function requestPrd(snapshot:IntakeSnapshot,change:string,signal:AbortSignal,mayIssue:()=>boolean,model?:string):Promise<PrdDraft>{
  const userPrompt=prdPrompt(snapshot,change)
  const [{queryWithModel},{asSystemPrompt},{getMainLoopModel}]=await Promise.all([import('../../services/api/claude.js'),import('../../utils/systemPromptType.js'),import('../../utils/model/model.js')])
  let issued=false
  const response=await queryWithModel({systemPrompt:asSystemPrompt(['Draft product requirements from supplied facts. Return strict JSON only. No tools or execution.']),userPrompt,signal,options:{model:model||getMainLoopModel(),querySource:'amirahco_prd_draft',agents:[],mcpTools:[],isNonInteractiveSession:false,hasAppendSystemPrompt:false,enablePromptCaching:false,maxOutputTokensOverride:4096,onProviderRequestStart:()=>{if(issued||signal.aborted||!mayIssue())return false;issued=true;return true}}})
  if(signal.aborted||!mayIssue())throw new Error('PRD generation was interrupted; late output was not applied.')
  const text=response.message.content.filter(block=>block.type==='text').map(block=>block.type==='text'?block.text:'').join('')
  if(response.isApiErrorMessage)throw new Error(text)
  if(response.message.stop_reason==='max_tokens')throw new Error('AI response reached its output limit.')
  return prdDraft.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i,'$1')))
}
