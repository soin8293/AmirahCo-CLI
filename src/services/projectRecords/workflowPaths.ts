import {existsSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

export type BundledWorkflowPaths={root:string;runner:string;graph:string;notices:string}

/** Path discovery is provider/UI independent for local recovery and evidence. */
export function getBundledWorkflowPaths():BundledWorkflowPaths|null{
  const here=dirname(fileURLToPath(import.meta.url))
  for(const root of [resolve(here,'../../../vendor/amirahco-core-foundry'),resolve(here,'../vendor/amirahco-core-foundry')]){
    const runner=resolve(root,'scripts/foundry.py'),graph=resolve(root,'workflows/amirahco-project-lifecycle.json'),notices=resolve(root,'../amirahco-core-sources/THIRD_PARTY_NOTICES.md')
    if(existsSync(runner)&&existsSync(graph))return {root,runner,graph,notices}
  }
  return null
}
