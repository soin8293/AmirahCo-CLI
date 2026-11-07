import React, {useEffect, useRef, useState} from 'react'
import {Box, Text} from '../ink.js'
import {Select} from './CustomSelect/index.js'
import {createWindowsUpdater} from '../../bin/windows-updater.mjs'

export function AmirahCoUpdateNotice(): React.ReactNode {
  const [message,setMessage] = useState('')
  useEffect(()=>{
    let mounted=true
    const check=async()=>{
      try {
        const result=await createWindowsUpdater().check()
        if(mounted) setMessage(result.kind === 'available' || result.kind === 'ready' ? result.message : '')
      } catch { /* Offline checks must not interrupt native work. */ }
    }
    void check()
    const timer=setInterval(()=>void check(),30*60*1000)
    return ()=>{mounted=false;clearInterval(timer)}
  },[])
  return message ? <Text color="success">{message}</Text> : null
}

type UpdateService=Pick<ReturnType<typeof createWindowsUpdater>,'check' | 'approve'>
export function AmirahCoUpdateDialog({onDone,createUpdater=createWindowsUpdater}:{onDone:(message:string)=>void;createUpdater?:()=>UpdateService}): React.ReactNode {
  const [updater]=useState(createUpdater)
  const [offer,setOffer]=useState<Awaited<ReturnType<typeof updater.check>> | null>(null)
  const [message,setMessage]=useState('Checking for updates…')
  const [busy,setBusy]=useState(false)
  const inFlight=useRef(false)
  useEffect(()=>{
    let mounted=true
    void updater.check(true).then(result=>{
      if(!mounted)return
      if(result.kind === 'available') {setOffer(result);setMessage(`AmirahCo CLI ${result.manifest.version} · release ${result.manifest.sequence}\n${result.manifest.notes}`)}
      else setMessage(result.message)
    }).catch(()=>{if(mounted)setMessage('Could not check for updates. Your current version and work are preserved.')})
    return ()=>{mounted=false}
  },[updater])
  async function select(value:string) {
    if(inFlight.current)return
    if(value === 'later'){onDone('Update deferred. You can keep working.');return}
    if(!offer || offer.kind !== 'available')return
    inFlight.current=true;setBusy(true)
    setMessage('Downloading and verifying the update… Your current session will stay open.')
    try {onDone((await updater.approve(offer.digest)).message)}
    catch {setMessage('Update could not finish. Your current version and work are preserved. Reopen /update to retry.');setOffer(null)}
    finally {inFlight.current=false;setBusy(false)}
  }
  return <Box flexDirection="column" gap={1}>
    <Text color="success">{message}</Text>
    {!busy && <Select defaultFocusValue="later" options={offer ? [{value:'install',label:'Install update on next safe launch'},{value:'later',label:'Later'}] : [{value:'later',label:'Back'}]} onChange={value=>void select(value)} onCancel={()=>onDone('Update deferred. You can keep working.')} />}
  </Box>
}
