import {expect,test} from 'bun:test'
import {analyzeContinuationIntent} from './continuation.js'

test('an echoed compatibility marker continues only after a tool turn',()=>{
 expect(analyzeContinuationIntent('[Tool results received]',{afterToolUse:true})).toEqual({shouldNudge:true,reason:'continuation_signal'})
 expect(analyzeContinuationIntent('[Tool results received]')).toEqual({shouldNudge:false})
 expect(analyzeContinuationIntent('The log contains [Tool results received].',{afterToolUse:true})).toEqual({shouldNudge:false})
 expect(analyzeContinuationIntent('Done. Tests passed.',{afterToolUse:true})).toEqual({shouldNudge:false})
})

test('a closed final command example stops while an open fence still continues',()=>{
 const handoff='Handoff complete. Waiting for owner review.\n```sh\nnode tasks.js list\nnode --test\n```'
 expect(analyzeContinuationIntent(handoff,{afterToolUse:true})).toEqual({shouldNudge:false})
 expect(analyzeContinuationIntent('Done.\n```\nVerified.\n```')).toEqual({shouldNudge:false})
 expect(analyzeContinuationIntent('Done.\n```sh\nnode --test')).toEqual({shouldNudge:true,reason:'possible_truncation'})
 expect(analyzeContinuationIntent('Done.\n```sh')).toEqual({shouldNudge:true,reason:'possible_truncation'})
})
