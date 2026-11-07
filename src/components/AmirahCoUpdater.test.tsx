import {test,expect} from 'bun:test'
import React from 'react'
import {PassThrough} from 'node:stream'
import {stripVTControlCharacters} from 'node:util'
import {createRoot} from '../ink.js'
import {AmirahCoUpdateDialog} from './AmirahCoUpdater.js'
import {AppStateProvider} from '../state/AppState.js'
import {KeybindingSetup} from '../keybindings/KeybindingProviderSetup.js'

async function wait(check:()=>boolean){for(let i=0;i<100;i++){if(check())return;await Bun.sleep(15)}throw new Error('Native update UI did not reach its expected state')}
async function open(){
 const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode:()=>{},ref:()=>{},unref:()=>{}})
 const output=new PassThrough();Object.assign(output,{columns:100,rows:30});let text='';output.on('data',chunk=>{text+=chunk.toString()})
 let approvals=0;let done=''
 // @ts-expect-error Ink's TTY types are stricter than this isolated in-memory terminal fixture.
 const root=await createRoot({stdin:input,stdout:output,stderr:output,exitOnCtrlC:false,patchConsole:false})
 root.render(<AppStateProvider><KeybindingSetup><AmirahCoUpdateDialog onDone={message=>{done=message}} createUpdater={()=>({check:async()=>({kind:'available',digest:'original-digest',manifest:{version:'1.0.1',sequence:6,notes:'Verified release notes.'},message:'Update available'}),approve:async digest=>{expect(digest).toBe('original-digest');approvals++;return{kind:'ready',message:'Update saved for the next safe launch.'}}})} /></KeybindingSetup></AppStateProvider>)
 await wait(()=>text.includes('Install update'))
 return {input,frame:()=>stripVTControlCharacters(text),approvals:()=>approvals,done:()=>done,close:()=>{root.unmount();input.end();output.end()}}
}
test('native update picker supports Later without approving or closing the session',async()=>{
 const ui=await open()
 try {expect(ui.frame()).toContain('Verified release notes.');ui.input.write('\r');await wait(()=>!!ui.done());expect(ui.done()).toContain('deferred');expect(ui.approvals()).toBe(0)}finally{ui.close()}
})
test('native update picker approves once and returns to the existing session',async()=>{
 const ui=await open()
 try {ui.input.write('\u001b[A');await Bun.sleep(30);ui.input.write('\r');await wait(()=>!!ui.done());expect(ui.approvals()).toBe(1);expect(ui.done()).toContain('next safe launch')}finally{ui.close()}
})
