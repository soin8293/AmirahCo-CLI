import { describe, expect, test } from 'bun:test'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import { getNextPermissionMode } from './getNextPermissionMode.js'
import { applyPermissionModeChange } from './permissionSetup.js'

describe('getNextPermissionMode', () => {
  test('local Shift+Tab can reach both dangerous modes without a launch flag', () => {
    let context={...getEmptyToolPermissionContext(),isBypassPermissionsModeAvailable:false}
    const modes: Array<typeof context.mode> = []
    for(let i=0;i<5;i++){
      const next=getNextPermissionMode(context,undefined,{allowSessionBypassPermissionsModeEnable:true})
      modes.push(next)
      // The real UI calls this only after native validation/confirmation.
      context=applyPermissionModeChange(context,next)
    }
    expect(modes).toEqual(['acceptEdits','plan','bypassPermissions','fullAccess','default'])
    expect(context.isBypassPermissionsModeAvailable).toBe(true)
    expect(context.mode).toBe('default')
  })

  test('previewing session unlock does not change the current mode or capability', () => {
    const context={...getEmptyToolPermissionContext(),mode:'plan' as const,isBypassPermissionsModeAvailable:false}
    expect(getNextPermissionMode(context,undefined,{allowSessionBypassPermissionsModeEnable:true})).toBe('bypassPermissions')
    expect(context.mode).toBe('plan');expect(context.isBypassPermissionsModeAvailable).toBe(false)
  })

  test('other callers still skip dangerous modes without the explicit local unlock option', () => {
    expect(getNextPermissionMode({...getEmptyToolPermissionContext(),mode:'plan',isBypassPermissionsModeAvailable:false})).toBe('default')
    expect(getNextPermissionMode({...getEmptyToolPermissionContext(),mode:'bypassPermissions',isBypassPermissionsModeAvailable:false})).toBe('default')
  })

  test('cycles from bypassPermissions to fullAccess when dangerous modes are available', () => {
    expect(
      getNextPermissionMode({
        ...getEmptyToolPermissionContext(),
        mode: 'bypassPermissions',
        isBypassPermissionsModeAvailable: true,
      }),
    ).toBe('fullAccess')
  })

  test('cycles from fullAccess back to default without auto mode', () => {
    expect(
      getNextPermissionMode({
        ...getEmptyToolPermissionContext(),
        mode: 'fullAccess',
        isBypassPermissionsModeAvailable: true,
      }),
    ).toBe('default')
  })
})
