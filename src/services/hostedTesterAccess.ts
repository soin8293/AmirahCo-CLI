import { z } from 'zod'
import {
  addProviderProfile,
  getActiveProviderProfile,
  getProviderProfiles,
  setActiveProviderProfile,
  updateProviderProfile,
  type ProviderProfileInput,
} from '../utils/providerProfiles.js'
import { HOSTED_TESTER_BASE_URL, HOSTED_TESTER_MODEL } from '../constants/hostedTesterEndpoint.js'

export const HOSTED_TESTER_PROFILE = 'AmirahCo tester access'
const keySchema = z.string().regex(/^sk-tp-[a-f0-9]{48}$/)
const catalogueSchema = z.object({ data: z.array(z.object({ id: z.string() })) })

export function testerEndpoint(value = process.env.AMIRAHCO_TESTER_BASE_URL ?? HOSTED_TESTER_BASE_URL): string {
  if (!value) throw new Error('Tester access is not available yet. You can still connect another provider.')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('The tester connection is unavailable.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    url.pathname.replace(/\/$/, '') !== '/v1' || url.hostname.endsWith('.trycloudflare.com')) {
    throw new Error('Tester access needs its configured HTTPS connection.')
  }
  return url.toString().replace(/\/$/, '')
}

type ConnectionDependencies = {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  readProfiles: typeof getProviderProfiles
  add: typeof addProviderProfile
  update: typeof updateProviderProfile
  active: typeof getActiveProviderProfile
  activate: typeof setActiveProviderProfile
}
const defaults: ConnectionDependencies = {
  fetch: (url, init) => globalThis.fetch(url, init), readProfiles: getProviderProfiles,
  add: addProviderProfile, update: updateProviderProfile,
  active: getActiveProviderProfile, activate: setActiveProviderProfile,
}

export async function connectTesterAccess(
  key: string,
  options: { signal: AbortSignal; endpoint?: string },
  dependencies: ConnectionDependencies = defaults,
): Promise<void> {
  const parsed = keySchema.safeParse(key.trim())
  if (!parsed.success) throw new Error('Paste the tester access key you received from AmirahCo.')
  const baseUrl = testerEndpoint(options.endpoint)
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
  let response: Response
  try {
    response = await dependencies.fetch(baseUrl + '/models', {
      method: 'GET', headers: { Authorization: 'Bearer ' + parsed.data },
      signal, redirect: 'error', cache: 'no-store',
    })
  } catch {
    if (options.signal.aborted) throw new Error('Connection cancelled. Your previous setup is unchanged.')
    throw new Error('Could not reach tester access. Your previous setup is unchanged.')
  }
  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403
      ? 'That tester key is not active. Ask AmirahCo to check your access.'
      : 'Tester access is unavailable right now. Your previous setup is unchanged.')
  }
  let catalogue: z.infer<typeof catalogueSchema>
  try { catalogue = catalogueSchema.parse(await response.json()) }
  catch { throw new Error('The tester connection returned an unexpected response. Nothing was saved.') }
  if (!catalogue.data.some(model => model.id === HOSTED_TESTER_MODEL)) {
    throw new Error('That key does not include AmirahCo tester access. Nothing was saved.')
  }
  if (options.signal.aborted) throw new Error('Connection cancelled. Your previous setup is unchanged.')
  const input = {
    provider: 'openai', name: HOSTED_TESTER_PROFILE, baseUrl,
    model: HOSTED_TESTER_MODEL, apiKey: parsed.data, apiFormat: 'chat_completions',
  } satisfies ProviderProfileInput
  try {
    const existing = dependencies.readProfiles().find(profile => profile.name === HOSTED_TESTER_PROFILE)
    // Reuse the same native profile after an interrupted save; never add duplicates.
    const saved = existing ? dependencies.update(existing.id, input)
      : dependencies.add(input, { makeActive: true })
    if (!saved) throw new Error('Profile save unavailable')
    const observed = dependencies.readProfiles().find(profile => profile.id === saved.id)
    if (!observed || observed.apiKey !== input.apiKey || observed.baseUrl !== input.baseUrl ||
      observed.model !== input.model) throw new Error('Profile save readback unavailable')
    if (dependencies.active()?.id !== saved.id && !dependencies.activate(saved.id)) {
      throw new Error('Profile activation unavailable')
    }
    if (dependencies.active()?.id !== saved.id) throw new Error('Profile activation readback unavailable')
  } catch {
    throw new Error('Could not finish saving tester access. Check your saved connection before trying again; your other profiles are still here.')
  }
}

