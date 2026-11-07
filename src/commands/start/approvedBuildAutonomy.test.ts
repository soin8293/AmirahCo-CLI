import {expect,test} from 'bun:test'
import {approvedBuildAutonomy} from './projectContext.js'

test.each([1,2,9,81])('approved work guidance preserves a total of %i and genuine owner boundaries',total=>{
  const guidance=approvedBuildAutonomy(total)
  expect(guidance).toContain(`selected total is ${total}, including the lead`)
  expect(guidance).toContain(total===1?'Do not spawn a worker':`exactly ${total-1} native teammates`)
  expect(guidance).toContain('current reviewed PRD')
  expect(guidance).toContain('reversible details')
  expect(guidance).toContain('record its rationale')
  expect(guidance).toContain('Reconcile an uncertain effect')
  expect(guidance).toContain('Stop')
  expect(guidance).toContain('Do not bypass native permissions')
  expect(guidance).toContain('Final owner acceptance remains separate')
  expect(guidance).toContain('read-only review does not authorize repairs')
})
