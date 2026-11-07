import {expect,test} from 'bun:test'
import {getTheme,THEME_NAMES} from './theme.js'

test('native theme modes use emerald chrome, readable surfaces and stable palette objects',()=>{
  for(const name of THEME_NAMES){
    const theme=getTheme(name)
    expect(getTheme(name)).toBe(theme)
    expect(theme.text).not.toBe(theme.background)
    expect(theme.brand).not.toBe(theme.background)
    for(const [token,color] of Object.entries(theme)){
      if(name.endsWith('ansi'))expect(color).toMatch(/^ansi:(green|greenBright|black|white)$/)
      else{
        const [,r,g,b]=color.match(/^rgb\((\d+),(\d+),(\d+)\)$/)??[]
        expect(g,`${name}.${token}`).toBeDefined()
        expect(Number(g),`${name}.${token}`).toBeGreaterThanOrEqual(Math.max(Number(r),Number(b)))
      }
    }
  }
})
