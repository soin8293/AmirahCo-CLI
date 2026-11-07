import {clarificationPrompt,decodeQuestions} from './clarification.js'

/** Reuse the native authenticated, tool-free model pipeline; no separate SDK or agent. */
export async function requestPersonalizedQuestions(data:Record<string,unknown>,signal:AbortSignal,mayIssue:()=>boolean,model?:string){
  const userPrompt=clarificationPrompt(data)
  const [{queryWithModel},{asSystemPrompt},{getMainLoopModel}]=await Promise.all([
    import('../../services/api/claude.js'),import('../../utils/systemPromptType.js'),import('../../utils/model/model.js'),
  ])
  let issued=false
  const response=await queryWithModel({
    systemPrompt:asSystemPrompt(['You select a small, relevant clarification batch. Return strict JSON only. No tools or execution.']),
    userPrompt,signal,
    options:{model:model||getMainLoopModel(),querySource:'amirahco_intake_clarification',agents:[],mcpTools:[],isNonInteractiveSession:false,hasAppendSystemPrompt:false,enablePromptCaching:false,maxOutputTokensOverride:2048,
      onProviderRequestStart:()=>{if(issued||signal.aborted||!mayIssue())return false;issued=true;return true},
    },
  })
  if(signal.aborted||!mayIssue())throw new Error('Clarification was interrupted; no late result was applied.')
  const text=response.message.content.filter(block=>block.type==='text').map(block=>block.type==='text'?block.text:'').join('')
  if(response.isApiErrorMessage)throw new Error(text)
  if(response.message.stop_reason==='max_tokens')throw new Error('AI response reached its output limit.')
  return {...decodeQuestions(text,data),responseId:response.message.id}
}
