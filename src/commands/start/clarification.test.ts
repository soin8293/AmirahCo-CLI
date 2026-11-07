import {expect,test} from 'bun:test'
import {clarificationInputHash,clarificationPrompt,currentClarification,decodeQuestions,clarificationState,clarificationFailureMessage} from './clarification.js'
import {projectContext,recommendAgents} from './projectContext.js'
const facts={idea:'A local CSV tracker',needs:'Import CSV; never upload bank data',success:'Accurate monthly totals',notes:''}
const q={intent:'csv-columns',question:'Which CSV columns are provided?',why:'Import behavior depends on the actual file format.',basedOn:['idea','needs']}
test('compatible model prose wrappers retain strict question validation',()=>{
 expect(decodeQuestions('Here are the questions:\n```json\n'+JSON.stringify({questions:[q]})+'\n```',facts).questions).toHaveLength(1)
 expect(()=>decodeQuestions('Here: '+JSON.stringify({questions:[{...q,approved:true}]}),facts)).toThrow()
})
test('follow-up errors explain recovery without exposing provider details',()=>{
 expect(clarificationFailureMessage(Object.assign(new Error('secret-token'),{status:401}))).toContain('authentication')
 expect(clarificationFailureMessage(new Error('429 exhausted'))).toContain('capacity')
 expect(clarificationFailureMessage(new Error("Profile 'retired' not found"))).toContain('routing profile')
 expect(clarificationFailureMessage(new Error('AI response reached its output limit.'))).toContain('nothing incomplete was saved')
 expect(clarificationFailureMessage(new SyntaxError('secret-response'))).toContain('format')
 expect(clarificationFailureMessage(new Error('secret-token'))).not.toContain('secret-token')
})
test('personalization prompt retains exclusions and asks for gaps rather than a fixed script',()=>{
 const prompt=clarificationPrompt(facts)
 expect(prompt).toContain('never upload bank data');expect(prompt).toContain('at most THREE');expect(prompt).toContain('ZERO');expect(prompt).toContain('Do not ask again');expect(prompt).toContain('No fixed questionnaire');expect(prompt).toContain('never introduce cloud upload')
})
test('structured question validation rejects duplicate intents, invalid sources, extra fields and excessive batches',()=>{
 expect(decodeQuestions(JSON.stringify({questions:[q]}),facts).questions).toHaveLength(1)
 expect(decodeQuestions('```json\n{"questions":[]}\n```',facts).questions).toHaveLength(0)
 for(const questions of [[q,q],[{...q,basedOn:['notes']}],[{...q,approved:true}],Array(4).fill(q)])expect(()=>decodeQuestions(JSON.stringify({questions}),facts)).toThrow()
})
test('saved context excludes stale question bundles and keeps unknown responses unresolved',()=>{
 const value={version:1,inputHash:clarificationInputHash(facts),status:'done',attempts:1,questions:[q],responses:{'csv-columns':'not sure'}}
 const data={...facts,clarification:JSON.stringify(value),helpers:'1'}
 expect(currentClarification(data)).toBeDefined();expect(projectContext(data).personalizedAnswers[0]?.unresolved).toBe(true)
 expect(currentClarification({...data,needs:'Completely different app'})).toBeUndefined();expect(projectContext({...data,needs:'Different'}).personalizedAnswers).toEqual([])
 expect(clarificationInputHash({...facts,helpers:'7'})).toBe(clarificationInputHash(facts))
})
test('clarified scope can refine the recommendation while preserving the chosen total',()=>{
 const data={idea:'A mobile app',needs:'Show a list',success:'Readable',notes:''}
 const clarification={version:1,inputHash:clarificationInputHash(data),status:'done',attempts:1,questions:[{...q,intent:'data',basedOn:['idea']}],responses:{data:'API and SQL database'}}
 expect(recommendAgents({...data,clarification:JSON.stringify(clarification)}).count).toBe(3)
 expect(projectContext({...data,clarification:JSON.stringify(clarification),helpers:'1'}).requestedAgents).toBe(1)
})
test('large inputs and fabricated answer keys fail without clipping or extra requests',()=>{
 expect(()=>clarificationPrompt({...facts,notes:'x'.repeat(32769)})).toThrow()
 expect(()=>clarificationState.parse({version:1,inputHash:clarificationInputHash(facts),status:'done',attempts:1,questions:[q],responses:{invented:'answer'}})).toThrow()
})
