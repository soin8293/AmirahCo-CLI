import React from 'react'
import {Box,Text,useAnimationFrame} from '../ink.js'
import {useSettings} from '../hooks/useSettings.js'
import {useTerminalSize} from '../hooks/useTerminalSize.js'
import {isFullscreenEnvEnabled} from '../utils/fullscreen.js'
import {formatStartupScreen} from './StartupScreen.js'
import {MatrixElric} from './LogoV2/MatrixElric.js'

export type GlobeActivity='idle'|'working'|'tools'
export const GlobeActivityContext=React.createContext<GlobeActivity>('idle')

/** Decorative motion continues while visible; reduced-motion/offscreen still pause. */
export const StartupBanner=React.memo(function StartupBanner(){
  const {columns}=useTerminalSize()
  const activity=React.useContext(GlobeActivityContext)
  const reducedMotion=useSettings().prefersReducedMotion??false
  const active=!reducedMotion
  const [ref,time]=useAnimationFrame(active&&!reducedMotion?160:null)
  const rotation=React.useRef(0)
  const lastTime=React.useRef(time)
  React.useEffect(()=>{lastTime.current=time},[active,activity])
  if(active&&!reducedMotion){
    const delta=Math.min(200,Math.max(0,time-lastTime.current))
    rotation.current=(rotation.current+delta*(activity==='tools'?0.045:0.025))%360
    lastTime.current=time
  }
  const angle=rotation.current
  const banner=React.useMemo(()=>formatStartupScreen(undefined,columns,true,angle,false),[columns,angle])
  return isFullscreenEnvEnabled()?<Box ref={ref} flexDirection="column" flexShrink={0}><MatrixElric/><Text wrap="truncate-end">{banner}</Text></Box>:null
})
