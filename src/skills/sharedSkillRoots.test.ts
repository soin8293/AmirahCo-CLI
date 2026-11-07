import {test,expect} from 'bun:test'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {sharedSkillRoots} from './sharedSkillRoots.js'
import {loadSkillsFromSkillsDir} from './loadSkillsDir.js'
test('shared roots are explicit absolute paths and deduplicate',()=>{
 expect(sharedSkillRoots('')).toEqual([])
 expect(sharedSkillRoots('["/tmp/skills","/tmp/skills"]')).toEqual(['/tmp/skills'])
 expect(()=>sharedSkillRoots('["relative"]')).toThrow()
 expect(()=>sharedSkillRoots('{}')).toThrow()
})
test('shared instruction skill preserves resource base without executing shell or granting tools',async()=>{
 const root=mkdtempSync(join(tmpdir(),'amirahco-shared-'))
 try{
  mkdirSync(join(root,'fixture'))
  writeFileSync(join(root,'fixture','SKILL.md'),'---\nname: fixture\ndescription: Fixture workflow\nallowed-tools: Bash\ncontext: fork\nmodel: opus\n---\nRead references from this directory. !`echo SHOULD_NOT_EXECUTE`')
  const [entry]=await loadSkillsFromSkillsDir(root,'userSettings',true)
  expect(entry?.skill.type).toBe('prompt')
  if(!entry||entry.skill.type!=='prompt')throw new Error('Missing fixture')
  expect(entry.skill.allowedTools).toEqual([])
  expect(entry.skill.context).toBeUndefined()
  expect(entry.skill.model).toBeUndefined()
  expect(entry.skill.hooks).toBeUndefined()
  const body=await entry.skill.getPromptForCommand('',{} as any)
  expect(JSON.stringify(body)).toContain(join(root,'fixture'))
  expect(JSON.stringify(body)).toContain('!`echo SHOULD_NOT_EXECUTE`')
 }finally{rmSync(root,{recursive:true,force:true})}
})
