import {existsSync} from 'node:fs'
import {createConnection} from 'node:net'
import {spawn} from 'node:child_process'
import {isLocalStartupInvocation} from './startup-loading.mjs'

function loopbackReady() {
  return new Promise(resolve => {
    const socket = createConnection({host: '127.0.0.1', port: 31416})
    const finish = value => { socket.destroy(); resolve(value) }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(200, () => finish(false))
  })
}

function runExistingController(script) {
  return new Promise(resolve => {
    // This is the existing transport controller, not an agent or router restart.
    const child = spawn('python3', [script, '--target', 'freellm'], {
      stdio: 'ignore', timeout: 5000, killSignal: 'SIGKILL', windowsHide: true,
    })
    child.once('error', () => resolve(false))
    child.once('close', code => resolve(code === 0))
  })
}

export async function prepareStartupConnection(args, env = process.env, dependencies = {}) {
  if (isLocalStartupInvocation(args) || env.OPENAI_BASE_URL !== 'http://127.0.0.1:31416/v1'
      || !env.AMIRAHCO_ROUTER_BRIDGE) return null
  const probe = dependencies.probe ?? loopbackReady
  if (await probe()) return null
  const warning = 'AI is temporarily unavailable. Saved projects and local menus remain available.'
  if (!existsSync(env.AMIRAHCO_ROUTER_BRIDGE)) return warning
  const run = dependencies.run ?? runExistingController
  return await run(env.AMIRAHCO_ROUTER_BRIDGE) ? null : warning
}
