import React from 'react'
import {Box,Text} from '../ink.js'
import {useAppState,useSetAppState} from '../state/AppState.js'
import {enterTeammateView,exitTeammateView} from '../state/teammateViewHelpers.js'
import {isLocalAgentTask} from '../tasks/LocalAgentTask/LocalAgentTask.js'
import {useTerminalSize} from '../hooks/useTerminalSize.js'
import {Tabs,Tab} from './design-system/Tabs.js'

/** A view selector over native tasks. No separate sessions, tools or workers. */
export function AgentSessionTabs(){
  const tasks=useAppState(state=>state.tasks)
  const selected=useAppState(state=>state.viewingAgentTaskId)
  const setState=useSetAppState()
  const {columns}=useTerminalSize()
  const agents=Object.values(tasks).filter(task=>isLocalAgentTask(task)||task.type==='in_process_teammate')
  const all=[{id:'main',title:'Lead'},...agents.map(task=>({id:task.id,title:`${task.description.slice(0,18)} · ${task.status}`}))]
  const active=all.some(tab=>tab.id===selected)?selected!:'main'
  const pageSize=Math.max(1,Math.floor((columns-12)/28))
  const index=all.findIndex(tab=>tab.id===active)
  const page=Math.floor(index/pageSize)
  const choose=(id:string)=>id==='main'?exitTeammateView(setState):enterTeammateView(id,setState)
  return <Box flexDirection="column" flexShrink={0}>
    <Box gap={1}><Text dimColor>Agents</Text><Box onClick={()=>choose(all[(index+all.length-1)%all.length]!.id)}><Text>‹</Text></Box><Text dimColor>{index+1}/{all.length}</Text><Box onClick={()=>choose(all[(index+1)%all.length]!.id)}><Text>›</Text></Box><Text dimColor>/tasks to manage</Text></Box>
    <Tabs selectedTab={active} onTabChange={choose} initialHeaderFocused={false} disableNavigation={true}>{all.slice(page*pageSize,(page+1)*pageSize).map(tab=><Tab key={tab.id} id={tab.id} title={tab.title}>{null}</Tab>)}</Tabs>
  </Box>
}
