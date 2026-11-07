import { readFileSync, writeSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { parseArgs } from 'node:util'

const KEY = Symbol.for('amirahco.startup-loading.stop')
const LOCAL_COMMANDS = new Set(['project-records', 'skills', 'mcp', 'ps', 'logs', 'attach', 'kill', 'doctor', 'update', 'auth', 'config', 'agents'])
const LOCAL_FLAGS = new Set(['--version', '-v', '-V', '--help', '-h', '--init-only', '--maintenance', '--dump-system-prompt'])
const VALUE_OPTIONS = ['provider', 'model', 'agent', 'settings', 'system-prompt', 'system-prompt-file', 'append-system-prompt', 'append-system-prompt-file', 'permission-mode', 'provider-env-file', 'output-format', 'input-format', 'session-id', 'name', 'effort', 'max-turns', 'max-budget-usd', 'fallback-model', 'mcp-config', 'plugin-dir', 'tools', 'allowedTools', 'disallowedTools', 'add-dir', 'setting-sources']
const BOOLEAN_OPTIONS = ['bare', 'debug', 'verbose', 'yolo', 'dangerously-skip-permissions', 'allow-dangerously-skip-permissions', 'continue', 'resume', 'no-session-persistence', 'disable-slash-commands', 'strict-mcp-config', 'include-partial-messages', 'ide', 'init', 'init-only', 'maintenance', 'dump-system-prompt']
const OPTIONS = {
  ...Object.fromEntries(VALUE_OPTIONS.map(name => [name, {type: 'string'}])),
  ...Object.fromEntries(BOOLEAN_OPTIONS.map(name => [name, {type: 'boolean'}])),
  version: {type: 'boolean', short: 'v'}, help: {type: 'boolean', short: 'h'},
  print: {type: 'boolean', short: 'p'}, c: {type: 'boolean'}, r: {type: 'boolean'}, V: {type: 'boolean'},
}

function startupIntent(args) {
  try {
    const {tokens} = parseArgs({args, options: OPTIONS, tokens: true, strict: false, allowPositionals: true})
    const end = tokens.find(token => token.kind === 'option-terminator')?.index ?? Infinity
    const command = tokens.find(token => token.kind === 'positional' && token.index < end)?.value
    const flags = tokens.filter(token => token.kind === 'option')
    const unknown = flags.some(token => !Object.hasOwn(OPTIONS, token.name))
    const local = flags.some(token => LOCAL_FLAGS.has('--' + token.name) || token.name === 'V')
      || (!unknown && command !== undefined && LOCAL_COMMANDS.has(command))
    return {local, print: flags.some(token => token.name === 'print'), unknown}
  } catch { return {local: false, print: false, unknown: true} }
}

export function isLocalStartupInvocation(args) {
  return startupIntent(args).local
}

export function shouldShowStartupLoading(args, env, terminal) {
  const intent = startupIntent(args)
  return Boolean(terminal.stdinTTY && terminal.stdoutTTY && terminal.stderrTTY
    && !env.CI && env.TERM !== 'dumb' && env.AMIRAHCO_STARTUP_PROGRESS !== '0'
    && !intent.local && !intent.print && !intent.unknown)
}

export function queueStartupNotice(message) {
  const stop = globalThis[KEY]
  if (typeof stop === 'function') stop.notice = message
  else process.stderr.write(message + '\n')
}

export function formatStartupLoadingFrame(frame, seconds, columns = 80, color = true) {
  const available = Math.max(1, columns - 1)
  const prefix = columns >= 48 ? 'Loading AmirahCo CLI ' : columns >= 28 ? 'Loading ' : ''
  const suffix = ` ${seconds}s`
  const cells = Math.max(3, Math.min(22, available - prefix.length - suffix.length - 2))
  const active = frame % (cells + 3) - 3
  const bar = Array.from({length: cells}, (_, i) => i >= active && i < active + 3 ? '━' : '─').join('')
  const line = `${prefix}[${bar}]${suffix}`.slice(0, available)
  return '\r\x1b[2K' + (color ? `\x1b[38;5;${[35, 42, 48, 79][frame % 4]}m${line}\x1b[0m` : line)
}

export function supportsStartupLoadingHandoff(bundle) {
  try { return readFileSync(bundle, 'utf8').includes('amirahco.startup-loading.stop') }
  catch { return false }
}

export async function startStartupLoading(args = process.argv.slice(2), nativeBundle) {
  if (!shouldShowStartupLoading(args, process.env, {
    stdinTTY: process.stdin.isTTY, stdoutTTY: process.stdout.isTTY, stderrTTY: process.stderr.isTTY,
  })) return async () => {}
  // Older/reverted bundles lack the handoff: never paint over their native UI.
  if (nativeBundle && !supportsStartupLoadingHandoff(nativeBundle)) return async () => {}
  const state = new Int32Array(new SharedArrayBuffer(4))
  let worker
  try {
    worker = new Worker(new URL('./startup-loading-worker.mjs', import.meta.url), {
      execArgv: [],
      resourceLimits: {maxOldGenerationSizeMb: 32},
      workerData: {state: state.buffer, columns: process.stderr.columns || 80, color: !process.env.NO_COLOR},
    })
  } catch { return async () => {} }
  worker.unref()
  let resolveExit
  const exited = new Promise(resolve => { resolveExit = resolve })
  worker.once('exit', () => resolveExit())
  worker.on('error', () => resolveExit())
  let stopping
  const onExit = () => {
    Atomics.store(state, 0, 1)
    void worker.terminate()
    try { writeSync(2, '\x1b[0m\n') } catch {}
  }
  const stop = () => stopping ??= (async () => {
    Atomics.store(state, 0, 1)
    try { worker.postMessage('stop') } catch {}
    let timer
    await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 500) })])
    clearTimeout(timer)
    await worker.terminate()
    process.removeListener('exit', onExit)
    if (globalThis[KEY] === stop) delete globalThis[KEY]
    try { writeSync(2, '\r\x1b[2K\x1b[0m') } catch {}
    if (stop.notice) process.stderr.write(stop.notice + '\n')
  })()
  globalThis[KEY] = stop
  process.once('exit', onExit)
  let readyTimer
  const ready = await Promise.race([
    new Promise(resolve => worker.once('message', message => resolve(message === 'ready'))),
    new Promise(resolve => { readyTimer = setTimeout(() => resolve(false), 500) }),
    exited.then(() => false),
  ])
  clearTimeout(readyTimer)
  if (!ready) await stop()
  return stop
}
