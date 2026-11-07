import assert from 'node:assert/strict'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {prepareStartupConnection} from './startup-connection.mjs'

const route = {OPENAI_BASE_URL: 'http://127.0.0.1:31416/v1', AMIRAHCO_ROUTER_BRIDGE: '/missing-controller.py'}
const forbidden = async () => { throw Error('Unexpected network/controller operation') }

test('local commands and other provider routes never prepare this connection', async () => {
  for (const args of [['--version'], ['--help'], ['skills', 'list'], ['project-records', 'read', 'id']]) {
    assert.equal(await prepareStartupConnection(args, route, {probe: forbidden, run: forbidden}), null)
  }
  assert.equal(await prepareStartupConnection([], {...route, OPENAI_BASE_URL: 'https://example.invalid/v1'}, {probe: forbidden}), null)
})

test('an existing listener is reused without launching or replacing its owner', async () => {
  assert.equal(await prepareStartupConnection([], route, {probe: async () => true, run: forbidden}), null)
})

test('a missing controller yields a nonfatal notice instead of blocking the native menu', async () => {
  const notice = await prepareStartupConnection([], route, {probe: async () => false, run: forbidden})
  assert.match(notice, /local menus remain available/)
})

test('a stalled real preparation process is killed at the bound, never the application', {skip: process.platform === 'win32'}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'amirahco-connection-'))
  try {
    const controller = join(root, 'controller.py')
    writeFileSync(controller, 'import signal,time\nsignal.signal(signal.SIGTERM,signal.SIG_IGN)\ntime.sleep(60)\n')
    const start = Date.now()
    const notice = await prepareStartupConnection([], {...route, AMIRAHCO_ROUTER_BRIDGE: controller}, {probe: async () => false})
    assert.match(notice, /local menus remain available/)
    assert.ok(Date.now() - start >= 4800)
    assert.ok(Date.now() - start < 7000)
  } finally { rmSync(root, {recursive: true}) }
})
