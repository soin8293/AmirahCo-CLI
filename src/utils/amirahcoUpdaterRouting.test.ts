import {expect,test} from 'bun:test'
import {withMockMacro} from '../test/mockMacro.js'
import {getLatestVersion,getLatestVersionFromGcs,getNpmDistTags,getGcsDistTags,getVersionHistory,installGlobalPackage,assertMinVersion} from './autoUpdater.js'
import {installOrUpdateClaudePackage} from './localInstaller.js'
import {getGlobalUpdateFailureHint} from '../cli/update.js'

test('AmirahCo refuses every legacy release lookup and installation before external effects',async()=>{
 await withMockMacro({PACKAGE_URL:'@amirahco/cli'},async()=>{
  const {removeStaleNativeLauncherForNpmUpdate}=await import('../commands/update/update.js')
  expect(await getLatestVersion('latest')).toBeNull()
  expect(await getLatestVersionFromGcs('latest')).toBeNull()
  expect(await getNpmDistTags()).toEqual({latest:null,stable:null})
  expect(await getGcsDistTags()).toEqual({latest:null,stable:null})
  expect(await getVersionHistory(5)).toEqual([])
  expect(await installGlobalPackage('2.0.0')).toBe('install_failed')
  expect(await installOrUpdateClaudePackage('latest')).toBe('install_failed')
  expect(await assertMinVersion()).toBeUndefined()
  expect(getGlobalUpdateFailureHint(false)).toContain('/update')
  let removals=0
  expect(await removeStaleNativeLauncherForNpmUpdate({removeInstalledSymlink:async()=>{removals++}})).toBe(false)
  expect(removals).toBe(0)
 })
})
