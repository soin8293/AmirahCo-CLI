import React, { useEffect, useRef, useState } from 'react'
import { Box, Text, useInput } from '../ink.js'
import TextInput from './TextInput.js'
import { Select } from './CustomSelect/index.js'
import { LoadingState } from './design-system/LoadingState.js'
import { connectTesterAccess } from '../services/hostedTesterAccess.js'
import reconciler from '../ink/reconciler.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { connectRegisteredTester } from '../services/registeredTesterAccess.js'

export function TesterAccessSetup({ onBack, onOtherProvider, onConnected, connect = connectTesterAccess, account = connectRegisteredTester }: {
  onBack(): void
  onOtherProvider(): void
  onConnected(): void
  connect?: typeof connectTesterAccess
  account?: typeof connectRegisteredTester
}) {
  const [mode, setMode] = useState<'choose' | 'key' | 'account'>('choose')
  const [accountStatus,setAccountStatus]=useState<'pending'|'revoked'|null>(null)
  const [browserUrl,setBrowserUrl]=useState('')
  const [key, setKey] = useState(''), [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const { columns } = useTerminalSize()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  useInput((input, pressed, event) => {
    if (pressed.escape || pressed.ctrl && input === 'q') {
      controller.current?.abort(); setKey(''); onBack(); event.stopImmediatePropagation()
    }
  })
  const submit = async () => {
    if (busy) return
    setBusy(true); setError('')
    const abort = new AbortController(); controller.current = abort
    try {
      await connect(key, { signal: abort.signal })
      if (mounted.current && !abort.signal.aborted) reconciler.flushSyncFromReconciler(() => { setKey(''); setBusy(false); onConnected() })
    } catch (failure) {
      if (mounted.current && !abort.signal.aborted) reconciler.flushSyncFromReconciler(() => {
        setError(failure instanceof Error ? failure.message : 'Tester access could not be connected.')
        setBusy(false)
      })
    }
  }
  const signIn=async()=>{
    if(busy)return
    setMode('account');setBusy(true);setError('');setAccountStatus(null);setBrowserUrl('')
    const abort=new AbortController();controller.current=abort
    try{
      const result=await account({signal:abort.signal,onBrowserUrl:url=>{
        if(mounted.current&&!abort.signal.aborted)reconciler.flushSyncFromReconciler(()=>setBrowserUrl(url))
      }})
      if(mounted.current&&!abort.signal.aborted)reconciler.flushSyncFromReconciler(()=>{
        setBusy(false);setBrowserUrl('')
        if(result==='connected')onConnected();else setAccountStatus(result)
      })
    }catch(failure){if(mounted.current&&!abort.signal.aborted)reconciler.flushSyncFromReconciler(()=>{
      setBusy(false);setBrowserUrl('');setError(failure instanceof Error?failure.message:'Account setup could not finish.')
    })}
  }
  return <Box flexDirection="column">
    <Text bold>Add API key</Text>
    {mode === 'choose' ? <Select options={[
      {value:'account',label:'Sign in for tester access',description:'Use Google to request access or check your approval'},
      {value:'tester',label:'Enter tester access key',description:'Use the access key you received from AmirahCo'},
      {value:'other',label:'Connect another provider',description:'Use your own provider account or API key'},
      {value:'back',label:'Back'},
    ]} hideIndexes={true} onChange={value => {
      if(value==='account')void signIn()
      else if (value === 'tester') setMode('key')
      else if (value === 'other') onOtherProvider()
      else onBack()
    }}/> : mode==='account'?<>
      <Text>Sign in with your Google account. AmirahCo reviews tester requests before granting access.</Text>
      <Text dimColor>Partner access may send your prompts and relevant project files to Heabsy or Inferbase. Access has a limited allowance.</Text>
      {busy?<><LoadingState message="Checking your tester account…" subtitle="Complete Google sign-in in your browser · Esc cancels"/>
        {browserUrl&&<Text dimColor>Sign-in link: {browserUrl}</Text>}</>:<>
        {accountStatus==='pending'&&<Text>Your request is awaiting AmirahCo approval. You can come back later and check your access.</Text>}
        {accountStatus==='revoked'&&<Text>Tester access is not active. Contact AmirahCo to review your access.</Text>}
        {error&&<Text color="error">{error}</Text>}
        <Select hideIndexes={true} options={[{value:'check',label:'Sign in and check access'},{value:'back',label:'Back'}]}
          onChange={value=>{if(value==='check')void signIn();else onBack()}}/>
      </>}
    </>: <>
      <Text>Paste your AmirahCo tester access key.</Text>
      <Text dimColor>When you use partner access, Heabsy or Inferbase may process your prompts and relevant project files. Access has a limited allowance.</Text>
      {busy ? <LoadingState message="Checking your tester key…" subtitle="Esc cancels"/> : <TextInput
        value={key} onChange={value => {setKey(value); setError('')}} mask="*"
        cursorOffset={cursor} onChangeCursorOffset={setCursor} columns={Math.max(10, columns - 6)}
        focus={true} showCursor={true} disableEscapeDoublePress={true} onSubmit={() => {void submit()}}/>}
      {error && <Text color="error">{error}</Text>}
      <Text dimColor>Enter connects · Esc returns without changing your setup</Text>
    </>}
  </Box>
}
