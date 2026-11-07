import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, dirname, resolve, basename} from 'node:path'
import { formatStartupLoadingFrame, shouldShowStartupLoading, startStartupLoading, supportsStartupLoadingHandoff } from './startup-loading.mjs'

const tty = {stdinTTY: true, stdoutTTY: true, stderrTTY: true}
test('startup display is interactive-only and never contaminates management or print commands', () => {
  assert.equal(shouldShowStartupLoading([], {}, tty), true)
  assert.equal(shouldShowStartupLoading(['--provider', 'openai', '--resume', 'original-id'], {}, tty), true)
  assert.equal(shouldShowStartupLoading(['--', '--print'], {}, tty), true)
  assert.equal(shouldShowStartupLoading(['--system-prompt', '--print'], {}, tty), true)
  assert.equal(shouldShowStartupLoading(['--model', 'config'], {}, tty), true)
  for (const args of [['--version'], ['-h'], ['--provider', 'openai', '--print', 'text'], ['--bare', 'skills', 'list'], ['skills', 'list'], ['project-records', 'verify', 'id']]) {
    assert.equal(shouldShowStartupLoading(args, {}, tty), false)
  }
  for (const key of Object.keys(tty)) assert.equal(shouldShowStartupLoading([], {}, {...tty, [key]: false}), false)
  for (const env of [{CI: '1'}, {TERM: 'dumb'}, {AMIRAHCO_STARTUP_PROGRESS: '0'}]) {
    assert.equal(shouldShowStartupLoading([], env, tty), false)
  }
})

test('bar moves without inventing percentages and stays on one line in narrow terminals', () => {
  assert.notEqual(formatStartupLoadingFrame(3, 1, 80, false), formatStartupLoadingFrame(4, 1, 80, false))
  for (const width of [8, 20, 40, 80, 140]) {
    const frame = formatStartupLoadingFrame(4, 12, width)
    const visible = frame.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '')
    assert.ok(visible.length < width)
    assert.ok(!frame.includes('%'))
    assert.ok(!frame.includes('\n'))
    assert.ok(!frame.includes('\x1b[?25l')) // no cursor state to strand on interruption
  }
  assert.ok(!formatStartupLoadingFrame(2, 1, 80, false).includes('38;5'))
})

test('non-TTY invocation leaves streams, signals and global display ownership untouched', async () => {
  const write = process.stderr.write
  const signals = process.listenerCount('SIGINT')
  const stop = await startStartupLoading(['--version'])
  await stop()
  await stop()
  assert.equal(process.stderr.write, write)
  assert.equal(process.listenerCount('SIGINT'), signals)
  assert.equal(globalThis[Symbol.for('amirahco.startup-loading.stop')], undefined)
})

test('missing or older native bundles cannot acquire the display', () => {
  const root = mkdtempSync(join(tmpdir(), 'amirahco-startup-'))
  try {
    const bundle = join(root, 'cli.mjs')
    assert.equal(supportsStartupLoadingHandoff(bundle), false)
    writeFileSync(bundle, 'console.log("older native UI")')
    assert.equal(supportsStartupLoadingHandoff(bundle), false)
    writeFileSync(bundle, 'Symbol.for("amirahco.startup-loading.stop")')
    assert.equal(supportsStartupLoadingHandoff(bundle), true)
  } finally {
    assert.equal(dirname(root), resolve(tmpdir()))
    assert.ok(basename(root).startsWith('amirahco-startup-'))
    rmSync(root, {recursive: true})
  }
})
