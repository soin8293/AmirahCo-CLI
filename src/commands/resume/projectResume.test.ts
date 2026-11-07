import {describe,expect,test} from 'bun:test'
import {projectResumeArguments} from './projectResume.js'
import {savedIntakeBlockerForSession,type IntakeSnapshot} from '../../services/projectRecords/intakeStore.js'

describe('saved native project selection',()=>{
  test('keeps provider/model and persistence preference without replaying old startup input or permission flags',()=>{
    expect(projectResumeArguments(['node','/app/cli.mjs','old prompt','--resume','old-id','--provider','openai','--model=x','--bare','--dangerously-skip-permissions','--permission-mode','fullAccess','--no-session-persistence'],'/sessions/selected.jsonl')).toEqual(['/app/cli.mjs','--resume','/sessions/selected.jsonl','--provider','openai','--model=x','--bare','--no-session-persistence'])
  })
  test('checks the actual linked native session rather than the last intake shortcut',async()=>{
    const rows=[{projectId:'old',sessionIds:['old-session'],stopped:true},{projectId:'selected',sessionIds:['selected-session'],stopped:false}] as IntakeSnapshot[]
    expect(await savedIntakeBlockerForSession('selected-session',{list:async()=>rows})).toBeUndefined()
    expect(await savedIntakeBlockerForSession('old-session',{list:async()=>rows})).toContain('stopped')
  })
  test('does not treat broken storage or a pending projection as an empty successful resume',async()=>{
    expect(await savedIntakeBlockerForSession('selected',{list:async()=>[{projectId:'broken',unavailable:true} as IntakeSnapshot]})).toContain('could not be verified')
    expect(await savedIntakeBlockerForSession('selected',{list:async()=>{throw new Error('read failure')}})).toContain('could not be read')
    expect(await savedIntakeBlockerForSession('selected',{list:async()=>[{sessionIds:['selected'],projectionPending:true} as IntakeSnapshot]})).toContain('recovery')
  })
  test('continues discovery past the first intake page',async()=>{
    const offsets:number[]=[]
    const blocker=await savedIntakeBlockerForSession('selected',{list:async(offset=0)=>{
      offsets.push(offset)
      return offset===0?Array.from({length:200},()=>({sessionIds:['other']} as IntakeSnapshot)):[{sessionIds:['selected'],stopped:true} as IntakeSnapshot]
    }})
    expect(offsets).toEqual([0,200]);expect(blocker).toContain('stopped')
  })
})
