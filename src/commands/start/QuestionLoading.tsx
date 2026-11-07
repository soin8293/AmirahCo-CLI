import React,{useEffect,useState} from 'react'
import {Box,Text} from '../../ink.js'

/** Activity, not a fabricated percentage: the provider reports no progress total. */
export function QuestionLoading(){
  const [tick,setTick]=useState(0)
  useEffect(()=>{const timer=setInterval(()=>setTick(value=>value+1),250);return()=>clearInterval(timer)},[])
  const position=tick%17
  return <Box flexDirection="column"><Text color="success">[{Array.from({length:20},(_,index)=>index>=position&&index<position+4?'━':'─').join('')}] {Math.floor(tick/4)}s</Text><Text dimColor>Creating personalized questions… Ctrl+Q stops this request.</Text></Box>
}
