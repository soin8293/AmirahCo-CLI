import { writeSync } from 'node:fs'
import { parentPort, workerData } from 'node:worker_threads'
import { formatStartupLoadingFrame } from './startup-loading.mjs'

// A display-only worker keeps animation moving while the main thread loads code.
const state = new Int32Array(workerData.state)
const began = Date.now()
let frame = 0
const draw = () => {
  if (Atomics.load(state, 0)) return
  try {
    writeSync(2, formatStartupLoadingFrame(frame++, Math.floor((Date.now() - began) / 1000), workerData.columns, workerData.color))
  } catch { clearInterval(timer); parentPort.close() }
}
let timer
draw()
parentPort.postMessage('ready')
timer = setInterval(draw, 120)
parentPort.on('message', message => {
  if (message !== 'stop') return
  Atomics.store(state, 0, 1)
  clearInterval(timer)
  parentPort.close()
})
