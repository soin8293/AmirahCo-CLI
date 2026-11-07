import { PassThrough } from 'node:stream'
import type { ReadStream, WriteStream } from 'node:tty'
import React, { useLayoutEffect } from 'react'
import { expect, test } from 'bun:test'
import { createRoot } from '../../ink.js'
import instances from '../../ink/instances.js'
import { cellAt, type Screen } from '../../ink/screen.js'
import { AppStateProvider, useSetAppState } from '../../state/AppState.js'
import { KeybindingSetup } from '../../keybindings/KeybindingProviderSetup.js'
import { WelcomeV2 } from './WelcomeV2.js'


test.each([false,true])('native Matrix Elric animates in place and respects reduced motion %s', async reduced => {
  const globals = globalThis as Record<string, unknown>, previous = globals.MACRO
  globals.MACRO = { VERSION: 'test' }
  const output = new PassThrough() as unknown as WriteStream
  output.columns = 80; output.rows = 24; output.on('data', () => {})
  const input = new PassThrough() as unknown as ReadStream
  input.isTTY = true; input.setRawMode = () => input; input.ref = () => input; input.unref = () => input
  const root = await createRoot({ stdout: output, stdin: input, exitOnCtrlC: false, patchConsole: false })
  const frame = () => {
    const screen = (instances.get(output) as unknown as { frontFrame: { screen: Screen } })?.frontFrame.screen
    return screen ? Array.from({ length: screen.height }, (_, y) => Array.from({ length: screen.width }, (_, x) => cellAt(screen, x, y)?.char ?? ' ').join('')).join('\n') : ''
  }
  try {
    function Seed() {
      const set = useSetAppState()
      useLayoutEffect(() => { set(previous => ({...previous,settings:{...previous.settings,prefersReducedMotion:reduced}})) }, [])
      return null
    }
    root.render(<AppStateProvider><KeybindingSetup><Seed/><WelcomeV2 /></KeybindingSetup></AppStateProvider>)
    const start = Date.now()
    while (!frame().includes('Welcome to AmirahCo CLI') && Date.now() - start < 2000) await Bun.sleep(10)
    await Bun.sleep(100)
    expect(frame()).toContain('Welcome to AmirahCo CLI')
    expect(frame()).toMatch(/[\uFF66-\uFF9D]/)
    const original = frame()
    await Bun.sleep(850)
    if(reduced) expect(frame()).toBe(original)
    else expect(frame()).not.toBe(original)
    expect(frame().split('\n').length).toBe(original.split('\n').length)
    expect(frame()).not.toContain('█████')
  } finally {
    root.unmount(); input.end(); output.end(); globals.MACRO = previous
  }
}, 10000)
