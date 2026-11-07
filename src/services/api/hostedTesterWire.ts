import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HOSTED_TESTER_MODEL } from '../../constants/hostedTesterEndpoint.js'

export function isTesterWireRequest(init: RequestInit): boolean {
  return /^Bearer sk-tp-[a-f0-9]{48}$/.test(new Headers(init.headers).get('authorization') ?? '')
}

export function prepareTesterWireRequest(url: string, init: RequestInit, sessionId: string): RequestInit {
  if (!isTesterWireRequest(init)) return init
  const endpoint = new URL(url)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    !['/v1/chat/completions', '/v1/messages', '/v1/responses'].includes(endpoint.pathname) ||
    !sessionId || typeof init.body !== 'string') {
    throw new Error('Tester request could not be bound to its secure connection and session.')
  }
  const parsed = z.object({ model: z.literal(HOSTED_TESTER_MODEL),
    max_tokens: z.number().optional(), max_completion_tokens: z.number().optional(),
    max_output_tokens: z.number().optional(),
  }).passthrough().safeParse(JSON.parse(init.body))
  if (!parsed.success) throw new Error('Tester access cannot switch to another model or route.')
  const body = parsed.data
  const limits = [body.max_tokens, body.max_completion_tokens, body.max_output_tokens]
    .filter((value): value is number => value !== undefined && Number.isFinite(value) && value > 0)
  const limit = Math.max(1, Math.floor(Math.min(8192, ...limits)))
  delete body.max_tokens; delete body.max_completion_tokens; delete body.max_output_tokens
  if (endpoint.pathname.endsWith('/responses')) body.max_output_tokens = limit
  else body.max_tokens = limit
  const serialized = JSON.stringify(body)
  const identity = createHash('sha256').update('amirahco-tester-v1\n' + sessionId + '\n' + serialized).digest('hex')
  const headers = new Headers(init.headers)
  headers.set('Idempotency-Key', 'amirahco-' + identity)
  headers.set('X-Session-ID', sessionId)
  return { ...init, body: serialized, headers, redirect: 'error' }
}
