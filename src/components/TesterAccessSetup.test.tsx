import { PassThrough } from 'node:stream'
import type { ReadStream, WriteStream } from 'node:tty'
import React from 'react'
import { expect, test } from 'bun:test'
import { createRoot } from '../ink.js'
import instances from '../ink/instances.js'
import { cellAt, type Screen } from '../ink/screen.js'
import { AppStateProvider } from '../state/AppState.js'
import { KeybindingSetup } from '../keybindings/KeybindingProviderSetup.js'
import { TesterAccessSetup } from './TesterAccessSetup.js'
import type { connectTesterAccess } from '../services/hostedTesterAccess.js'
import type { connectRegisteredTester } from '../services/registeredTesterAccess.js'

async function wait(check:()=>boolean) {
  const start=Date.now();while(Date.now()-start<4000){if(check())return;await Bun.sleep(10)}
  throw new Error('Native tester control did not reach the expected state')
}
async function open(connect:typeof connectTesterAccess,account:typeof connectRegisteredTester=async()=>{throw new Error('Unexpected account fixture call')}) {
  const globals=globalThis as Record<string,unknown>, previous=globals.MACRO
  globals.MACRO={VERSION:'test'}
  const output=new PassThrough() as unknown as WriteStream
  output.columns=80;output.rows=24;output.on('data',()=>{})
  const input=new PassThrough() as unknown as ReadStream
  input.isTTY=true;input.setRawMode=()=>input;input.ref=()=>input;input.unref=()=>input
  let back=0,other=0,connected=0
  const root=await createRoot({stdout:output,stdin:input,exitOnCtrlC:false,patchConsole:false})
  instances.get(output)?.setAltScreenActive(true,true)
  root.render(<AppStateProvider><KeybindingSetup><TesterAccessSetup connect={connect} account={account}
    onBack={()=>back++} onOtherProvider={()=>other++} onConnected={()=>connected++}/></KeybindingSetup></AppStateProvider>)
  const frame=()=>{
    const screen=(instances.get(output) as unknown as {frontFrame:{screen:Screen}})?.frontFrame.screen
    return screen?Array.from({length:screen.height},(_,y)=>Array.from({length:screen.width},(_,x)=>cellAt(screen,x,y)?.char??' ').join('')).join('\n'):''
  }
  await wait(()=>frame().includes('Enter tester access key'))
  return {input,frame,state:()=>({back,other,connected}),close:()=>{root.unmount();input.end();output.end();globals.MACRO=previous}}
}
const key='sk-tp-'+'a'.repeat(48)
test('native tester input masks the key and Esc returns without a request',async()=>{
  let calls=0;const ui=await open(async()=>{calls++})
  try{
    ui.input.write('\x1b[B');await Bun.sleep(25);ui.input.write('\r');await wait(()=>ui.frame().includes('Paste your AmirahCo'))
    ui.input.write(key);await wait(()=>ui.frame().includes('********'))
    expect(ui.frame()).not.toContain(key);expect(ui.frame()).not.toContain('sk-tp-')
    ui.input.write('\x1b');await wait(()=>ui.state().back===1);expect(calls).toBe(0)
  }finally{ui.close()}
})
test('visible verification can be cancelled and a late reply cannot connect',async()=>{
  let signal:AbortSignal|undefined,finish=()=>{}
  const ui=await open(async(_key,options)=>{signal=options.signal;await new Promise<void>(resolve=>{finish=resolve})})
  try{
    ui.input.write('\x1b[B');await Bun.sleep(25);ui.input.write('\r');await wait(()=>ui.frame().includes('Paste your AmirahCo'))
    ui.input.write(key);await Bun.sleep(25);ui.input.write('\r')
    await wait(()=>ui.frame().includes('Checking your tester key'))
    ui.input.write('\x1b');await wait(()=>ui.state().back===1)
    expect(signal?.aborted).toBe(true);finish();await Bun.sleep(25)
    expect(ui.state().connected).toBe(0)
  }finally{ui.close()}
})
test('verification error keeps native input usable for a successful retry',async()=>{
  let calls=0;const ui=await open(async()=>{if(++calls===1)throw new Error('That tester key is not active.')})
  try{
    ui.input.write('\x1b[B');await Bun.sleep(25);ui.input.write('\r');await wait(()=>ui.frame().includes('Paste your AmirahCo'))
    ui.input.write(key);await Bun.sleep(25);ui.input.write('\r')
    await wait(()=>ui.frame().includes('not active'))
    ui.input.write('\r');await wait(()=>ui.state().connected===1)
    expect(calls).toBe(2);expect(ui.frame()).not.toContain(key)
  }finally{ui.close()}
})
test('other-provider setup stays available through native arrow selection',async()=>{
  const ui=await open(async()=>{throw new Error('Unexpected tester request')})
  try{
    ui.input.write('\x1b[B\x1b[B');await Bun.sleep(25);ui.input.write('\r')
    await wait(()=>ui.state().other===1);expect(ui.state().connected).toBe(0)
  }finally{ui.close()}
})

test('Google request stays pending and a later native check can connect without another chat message',async()=>{
  let calls=0;const ui=await open(async()=>{throw Error('Unexpected manual key')},async()=>++calls===1?'pending':'connected')
  try{
    ui.input.write('\r');await wait(()=>ui.frame().includes('awaiting AmirahCo approval'))
    expect(ui.state().connected).toBe(0)
    ui.input.write('\r');await wait(()=>ui.state().connected===1);expect(calls).toBe(2)
  }finally{ui.close()}
})
test('Google sign-in has visible progress and Esc fences late account replies',async()=>{
  let signal:AbortSignal|undefined,finish:(value:'connected')=>void=()=>{}
  const ui=await open(async()=>{},async options=>{signal=options.signal;return new Promise(resolve=>{finish=resolve})})
  try{
    ui.input.write('\r');await wait(()=>ui.frame().includes('Checking your tester account'))
    ui.input.write('\x1b');await wait(()=>ui.state().back===1);expect(signal?.aborted).toBe(true)
    finish('connected');await Bun.sleep(30);expect(ui.state().connected).toBe(0)
  }finally{ui.close()}
})
