import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {dirname,resolve,relative,isAbsolute} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const headingId=text=>text.toLowerCase().replace(/[`*_]/g,'').replace(/[^\p{L}\p{N}\s-]/gu,'').trim().replace(/\s/g,'-')
const withoutCode=body=>body.replace(/```[^]*?```|~~~[^]*?~~~/g,'')
export function inspectMarkdown(file,body){
  const errors=[]
  if(/npm\s+install\s+-g\s+@amirahco\/cli|paru\s+-S\s+amirahcocli/.test(body)) errors.push('unpublished package installation command')
  if(/git clone https:\/\/github\.com\/Gitlawb\/openclaude\.git/.test(body)) errors.push('setup clones upstream instead of AmirahCo-CLI')
  for(const match of withoutCode(body).matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)){
    const href=match[1].replace(/^<|>$/g,'')
    if(/^(https?:|mailto:|data:)/.test(href))continue
    const [path,fragment]=href.split('#'),target=path?resolve(dirname(resolve(root,file)),decodeURIComponent(path.split('?')[0])):resolve(root,file)
    const location=relative(root,target)
    if(location.startsWith('..')||isAbsolute(location)){errors.push(`link leaves repository: ${href}`);continue}
    if(!existsSync(target)){errors.push(`missing local link: ${href}`);continue}
    if(fragment&&target.endsWith('.md')){
      const anchors=new Set([...withoutCode(readFileSync(target,'utf8')).matchAll(/^#{1,6}\s+(.+)$/gm)].map(item=>headingId(item[1])))
      if(!anchors.has(decodeURIComponent(fragment)))errors.push(`missing Markdown heading: ${href}`)
    }
  }
  return errors
}

if(process.argv.includes('--self-test')){
  assert.deepEqual(inspectMarkdown('README.md','[Docs](docs/README.md)'),[])
  assert.ok(inspectMarkdown('README.md','[Missing](docs/__missing_release_guide__.md)').some(e=>e.includes('missing local')))
  assert.ok(inspectMarkdown('README.md','[Private](../private-machine-note.md)').some(e=>e.includes('leaves repository')))
  assert.ok(inspectMarkdown('README.md','[Wrong](README.md#__missing_heading__)').some(e=>e.includes('missing Markdown heading')))
  assert.ok(inspectMarkdown('README.md','npm install -g @amirahco/cli@latest').length)
  console.log(JSON.stringify({selfTestsPassed:5}))
}else{
  const listed=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','--','*.md'],{cwd:root,encoding:'utf8'})
  assert.equal(listed.status,0,listed.stderr)
  const files=[...new Set(listed.stdout.trim().split(/\r?\n/))].filter(file=>!file.includes('/')||file.startsWith('docs/')||file.startsWith('.github/')||file==='packaging/windows/README.md')
  const failures=[]
  for(const file of files)for(const error of inspectMarkdown(file,readFileSync(resolve(root,file),'utf8')))failures.push({file,error})
  for(const guide of ['README.md','FIRST-PROJECT.md','WORKFLOWS-AND-SKILLS.md','TROUBLESHOOTING.md','DATA-AND-PRIVACY.md','DEVELOPMENT.md'])if(!existsSync(resolve(root,'docs',guide)))failures.push({file:guide,error:'required user/developer guide missing'})
  const skills=readFileSync(resolve(root,'docs/WORKFLOWS-AND-SKILLS.md'),'utf8')
  for(const path of ['src/skills/bundled/amirahcoCore.ts','src/skills/bundled/amirahcoQuality.ts']){
    const source=readFileSync(resolve(root,path),'utf8').split('] as const')[0]
    for(const match of source.matchAll(/'(amirahco-[a-z-]+)'/g))if(!skills.includes('`'+match[1]+'`'))failures.push({file:'docs/WORKFLOWS-AND-SKILLS.md',error:'bundled name missing: '+match[1]})
  }
  const development=readFileSync(resolve(root,'docs/DEVELOPMENT.md'),'utf8')
  for(const pin of ['.node-version','.bun-version'])if(!development.includes(readFileSync(resolve(root,pin),'utf8').trim()))failures.push({file:'docs/DEVELOPMENT.md',error:'runtime pin differs: '+pin})
  console.log(JSON.stringify({ok:failures.length===0,markdownFiles:files.length,failures,externalUrlsChecked:false}))
  if(failures.length)process.exitCode=1
}
