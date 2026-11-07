import {resolve} from 'node:path'
import {currentClarification} from './clarification.js'
import type {LocalJSXCommandOnDone} from '../../types/command.js'
import {getCwd} from '../../utils/cwd.js'

export function approvedBuildAutonomy(selectedTotal:number):string {
  return [
    '## Approved-work autonomy',
    'Use the current reviewed PRD, goals, constraints and context to answer routine implementation questions yourself. Do not ask the owner to choose reversible details already within the approved task.',
    'Before deciding, ask internally what the criterion requires, what the available evidence says, and which existing implementation can be reused. Choose the smallest supported option, record its rationale and assumption in the project decision notes, then continue.',
    'Troubleshoot observed failures within the current task and remaining retry/budget limits. Reconcile an uncertain effect before another attempt; never invent evidence or repeatedly retry an unchanged failure.',
    `The selected total is ${selectedTotal}, including the lead. ${selectedTotal===1?'Do not spawn a worker or hidden reviewer. Self-checks remain self-checks.':`Use exactly ${selectedTotal-1} native teammates; do not create additional reviewers or assistant leads.`}`,
    'Use the bundled coding-quality skills through the native Skill tool when relevant. Matching is advisory, skills grant no permission, and read-only review does not authorize repairs.',
    'Hold for a genuine missing decision, material requirement change, missing credentials, exhausted allowance, uncertain authority, Stop or an unresolved external effect. Do not bypass native permissions, create paid fallback, reset limits or approve your own final acceptance.',
    'Return a separate correlated ASK only for such a genuine blocker. Preserve the current run, session, original action identity and unfinished work. Final owner acceptance remains separate.',
  ].join('\n')
}

/** A local starting suggestion, not a concurrency limit or model assessment. */
export function recommendAgents(answers:Record<string,unknown>){
  const scope=[...['idea','needs','success'].map(key=>String(answers[key]??'')),...Object.values(currentClarification(answers)?.responses||{})].join('\n')
    .replace(/\b(?:no|without|avoid|never|don'?t|do not)\b[^,.;\n]*/gi,'')
  const areas=[
    [/\b(website|web|frontend|front.end|interface|dashboard|mobile|app|pages?|ui|tracker)\b/i,'interface'],
    [/\b(api|backend|back.end|server|auth\w*|log.?in|sign.?in|payments?|integrat\w*)\b/i,'services/integrations'],
    [/\b(database|sql\w*|storage|persist\w*|csv|data import|import data|sync\w*)\b/i,'data'],
  ] as const
  const matched=areas.filter(([pattern])=>pattern.test(scope)).map(([,area])=>area)
  const count=Math.max(1,Math.min(3,matched.length))
  return {count,reason:count===1?'This looks like one focused workstream; one agent keeps coordination simple.':`Your answers span ${matched.join(', ')}. ${count} agents can divide those workstreams.`}
}

export function projectContextError(answers:Record<string,unknown>):string|undefined {
  for(const [key,label] of [['idea','a project idea'],['needs','features and constraints'],['success','success criteria']]){
    if(typeof answers[key!]!=='string'||!(answers[key!] as string).trim())return `Please add ${label} before confirming.`
  }
  const count=answers.helpers===undefined?'1':String(answers.helpers).trim()
  if(!/^[1-9]\d*$/.test(count)||!Number.isSafeInteger(Number(count)))return 'Choose a whole-number agent count starting at one.'
}

export function projectContext(answers:Record<string,unknown>,cwd=getCwd()){
  const text=(key:string)=>typeof answers[key]==='string'?answers[key].trim():''
  const idea=text('idea')
  const name=text('name')||idea.replace(/^(i (want|would like) to (build|make|create)\s+|build\s+|make\s+|create\s+)/i,'').split(/\s+/).slice(0,6).join(' ').slice(0,60)||'My project'
  return {
    version:1,idea,name,personalizedAnswers:(currentClarification(answers)?.questions||[]).map(question=>{const answer=currentClarification(answers)!.responses[question.intent]??'';return {intent:question.intent,question:question.question,answer,unresolved:!answer.trim()||/^(not sure|i don.t know|defer|skip)/i.test(answer.trim())}}),agentRecommendation:recommendAgents(answers),
    plannedFolder:text('folder')||resolve(cwd,name.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'')||'my-project'),
    currentWorkspace:cwd,
    requestedAgents:answers.helpers===undefined?1:/^[1-9]\d*$/.test(text('helpers'))&&Number.isSafeInteger(Number(text('helpers')))?Number(text('helpers')):undefined,
    requirements:text('needs'),successCriteria:text('success'),notes:text('notes'),
  }
}

export function contextSummary(answers:Record<string,unknown>,cwd=getCwd()){
  const data=projectContext(answers,cwd)
  return `Idea: ${data.idea}\nRequirements: ${data.requirements}\nSuccess: ${data.successCriteria}\nNotes: ${data.notes||'None'}\nName: ${data.name}\nPlanned folder (not created): ${data.plannedFolder}\nRequested agents: ${data.requestedAgents??'Choose a valid count'}${data.personalizedAnswers.map(q=>`\n${q.question} ${q.answer||'(deferred)'}`).join('')}`
}

export function completeProjectContext(answers:Record<string,unknown>,done:LocalJSXCommandOnDone,cwd=getCwd(),action:'continue'|'save'='continue'){
  const error=projectContextError(answers)
  if(error)throw new Error(error)
  const data=projectContext(answers,cwd)
  const brief=[
    'AMIRAHCO project context — confirmed by the user for the lead conversation.',
    'Use these answers as the starting context for requirements clarification and PRD planning; do not ask again for facts already supplied.',
    'Personalized question wording is a model proposal, not a fact. Only the recorded user responses are answers; deferred or not-sure items remain open. Never invent their resolution.',
    'This confirmed brief supersedes earlier intake briefs in this conversation. Flag conflicts instead of silently mixing incompatible project assumptions.',
    'This intake does not authorize building, modifying project files, starting workers, spending or uploading documents. Ask only necessary follow-up questions and obtain the later explicit build instruction.',
    'The planned folder has not been created or activated. The requested agent count is a preference, not a running team or extra mandatory lead. Notes and mentioned paths have not been opened or verified.',
    'User-provided project data:',JSON.stringify(data,null,2),
  ].join('\n\n')
  const nextStep='Continue the next context step NOW in this same lead conversation, without asking the user to type start, go, or another activation message. First summarize the project understanding from the supplied facts and personalized answers. Ask only the next material unanswered context questions, using the native AskUserQuestion interface when useful, or ask the user to confirm/edit the context summary if no material gaps remain. Do not repeat answered questions or invent answers to deferred items. This operation is context gathering and review only: do not implement, modify files, run shell commands, open mentioned paths, generate/publish a PRD, start workers, spend, or upload anything. Do not use tools other than AskUserQuestion for this step. Later PRD and build authorization remain separate.'
  done(action==='continue'?'Intake saved. Continuing context with the lead…':'Intake saved for later. Choose Continue context with AI in /start when ready.',{
    display:'system',shouldQuery:action==='continue',metaMessages:action==='continue'?[brief,nextStep]:[brief],
  })
}
