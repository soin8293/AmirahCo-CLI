import {expect, test} from 'bun:test'
import {finishStartupLoading} from './startupLoading.js'

test('native output waits for the bootstrap display to release ownership', async () => {
  const key = Symbol.for('amirahco.startup-loading.stop')
  const globals = globalThis as Record<symbol, unknown>
  const prior = globals[key]
  const order: string[] = []
  globals[key] = async () => { await new Promise(resolve=>setTimeout(resolve, 5)); order.push('bar-stopped') }
  try {
    await finishStartupLoading()
    order.push('native-output')
    expect(order).toEqual(['bar-stopped','native-output'])
  } finally { if (prior === undefined) delete globals[key]; else globals[key] = prior }
})

test('direct native execution needs no bootstrap display', async () => {
  await expect(finishStartupLoading()).resolves.toBeUndefined()
})
