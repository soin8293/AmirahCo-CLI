import {test,expect} from 'bun:test'
import {prdDraft,prdMutation,prdPrompt} from './prdContract.js'

const candidate=()=>({title:'Private tracker',summary:'Keep CSV records locally',requirements:[{key:'R1',outcome:'Import CSV locally',scope:'required',priority:'high',exclusions:['No bank linking or upload'],openQuestions:[],sourceFields:['needs'],criteria:[{key:'C1',description:'Import a fixture offline',method:'tool_check',blocking:true}]}],assumptions:[],openQuestions:[]})
test('PRD proposals cannot carry approval, execution, unknown fields or coercible criterion types',()=>{
  expect(prdDraft.safeParse({...candidate(),approved:true}).success).toBe(false)
  expect(prdDraft.safeParse({...candidate(),summary:'escape \u001b[31m'}).success).toBe(false)
  const draft=candidate();(draft.requirements[0]!.criteria[0] as any).blocking='true'
  expect(prdDraft.safeParse(draft).success).toBe(false)
  const duplicate=candidate();duplicate.requirements.push(duplicate.requirements[0]!)
  expect(prdDraft.safeParse(duplicate).success).toBe(false)
  expect(prdMutation.safeParse({type:'activation'}).success).toBe(false)
})
test('model input preserves exclusions and deferred answers, with a complete-input cap',()=>{
  const saved={projectId:'fixture',sequence:1,answers:{idea:'Private tracker',needs:'No bank linking or cloud upload',success:'Offline import'},step:6,phase:'review' as const,stopped:false,projectionPending:false}
  const prompt=prdPrompt(saved,'Use the existing CSV format')
  expect(prompt).toContain('No bank linking or cloud upload')
  expect(prompt).toContain('Use the existing CSV format')
  expect(prompt).toContain('Deferred/not-sure answers remain open')
  expect(prompt).toContain('No activation or permissions')
  expect(()=>prdPrompt({...saved,answers:{...saved.answers,needs:'a'.repeat(33000)}},'')).toThrow('32 KiB')
})

test('PRD prompts retain applied owner changes without turning them into new owner requests',()=>{
  const value={projectId:'11111111-1111-4111-8111-111111111111',answers:{idea:'Menu',needs:'No payments',success:'Readable'},prd:{ownerChanges:['Use USD prices','No analytics'],stale:false}} as any
  const payload=JSON.parse(prdPrompt(value,'').split('Saved input:\n')[1]!)
  expect(payload.appliedOwnerChanges).toEqual(['Use USD prices','No analytics']);expect(payload.ownerChange).toBe('')
  expect(payload.savedAnswers.needs).toBe('No payments')
})
test('owner change history exceeding count or byte bounds is rejected without omission',()=>{
  const value={projectId:'11111111-1111-4111-8111-111111111111',answers:{idea:'Menu'},prd:{ownerChanges:Array(33).fill('Keep owner constraint')}} as any
  expect(()=>prdPrompt(value,'')).toThrow('No instructions were omitted')
  value.prd.ownerChanges=Array(5).fill('x'.repeat(4096));expect(()=>prdPrompt(value,'')).toThrow('No instructions were omitted')
})
