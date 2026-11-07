/**
 * AMIRAHCO CLI startup screen — emerald wordmark and shaded text globe.
 * Called once at CLI startup before the Ink UI renders.
 *
 * Addresses: https://github.com/Gitlawb/openclaude/issues/55
 */

import { isLocalProviderUrl, resolveProviderRequest } from '../services/api/providerConfig.js'
import {
  getRouteLabel,
  isMiniMaxBaseUrl,
  resolveRouteIdFromBaseUrl,
} from '../integrations/routeMetadata.js'
import { getLocalOpenAICompatibleProviderLabel } from '../utils/providerDiscovery.js'
import { getSettings_DEPRECATED } from '../utils/settings/settings.js'
import { parseUserSpecifiedModel } from '../utils/model/model.js'
import { DEFAULT_GEMINI_MODEL } from '../utils/providerProfile.js'
import { BRAND_TAGLINE } from '../constants/brand.js'
import { getGlobalConfig } from '../utils/config.js'
import { ANSI_DIM, ANSI_RESET, ansiRgb } from '../utils/terminalAnsi.js'
import {
  resolveLogoPalette,
  type RGB,
} from './StartupScreen.palettes.js'

declare const MACRO: { VERSION: string; DISPLAY_VERSION?: string }

const RESET = ANSI_RESET
const DIM = ANSI_DIM

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function gradAt(stops: readonly RGB[], t: number): RGB {
  const c = Math.max(0, Math.min(1, t))
  const s = c * (stops.length - 1)
  const i = Math.floor(s)
  if (i >= stops.length - 1) return stops[stops.length - 1]
  return lerp(stops[i], stops[i + 1], s - i)
}

export function paintLine(text: string, stops: readonly RGB[], lineT: number): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const t = text.length > 1 ? lineT * 0.5 + (i / (text.length - 1)) * 0.5 : lineT
    const [r, g, b] = gradAt(stops, t)
    out += `${ansiRgb(r, g, b)}${text[i]}`
  }
  return out + RESET
}

// ─── Filled Block Text Logo ───────────────────────────────────────────────────

// ANSI Shadow figlet letterforms, one space between letters.
const LOGO_OPEN = [
  " █████╗ ███╗   ███╗██╗██████╗  █████╗ ██╗  ██╗ ██████╗ ██████╗",
  "██╔══██╗████╗ ████║██║██╔══██╗██╔══██╗██║  ██║██╔════╝██╔═══██╗",
  "███████║██╔████╔██║██║██████╔╝███████║███████║██║     ██║   ██║",
  "██╔══██║██║╚██╔╝██║██║██╔══██╗██╔══██║██╔══██║██║     ██║   ██║",
  "██║  ██║██║ ╚═╝ ██║██║██║  ██║██║  ██║██║  ██║╚██████╗╚██████╔╝",
  "╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝"
]

const LOGO_CLAUDE = [
  " ██████╗██╗     ██╗",
  "██╔════╝██║     ██║",
  "██║     ██║     ██║",
  "██║     ██║     ██║",
  "╚██████╗███████╗██║",
  " ╚═════╝╚══════╝╚═╝"
]

/** Orthographic text globe, Africa/Europe facing the viewer. ASCII cells keep
 * alignment predictable across terminal fonts; no image or network dependency. */
export function globeLines(width = 49, height = 17, rotation = 0): string[] {
  const land = [
    [[-17, 36], [10, 37], [33, 31], [44, 12], [51, 11], [40, -12], [32, -34], [18, -35], [9, -5], [-16, 14]],
    [[-10, 36], [-10, 59], [8, 71], [29, 71], [40, 55], [60, 60], [95, 75], [145, 62], [155, 45], [120, 20], [105, 0], [75, 8], [50, 30], [32, 30], [25, 42]],
    [[-82, 12], [-50, 5], [-35, -8], [-48, -30], [-69, -55], [-78, -15]],
    [[-168, 70], [-55, 70], [-60, 45], [-82, 10], [-110, 30], [-130, 50]],
    [[-54, 60], [-20, 70], [-40, 83], [-60, 78]],
    [[47, -13], [51, -16], [49, -26], [44, -24]],
  ]
  const inside = (lon: number, lat: number, polygon: number[][]): boolean => {
    let hit = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i]!
      const [xj, yj] = polygon[j]!
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }
  return Array.from({ length: height }, (_, row) => {
    let line = ''
    for (let col = 0; col < width; col++) {
      const x = (col - (width - 1) / 2) / ((width - 1) / 2)
      const y = ((height - 1) / 2 - row) / ((height - 1) / 2)
      const radius = x * x + y * y
      if (radius > 1) { line += ' '; continue }
      const z = Math.sqrt(1 - radius)
      const lat = Math.asin(y) * 180 / Math.PI
      const lon = ((Math.atan2(x, z) * 180 / Math.PI + 15 + rotation + 540) % 360) - 180
      const continent = land.some(polygon => inside(lon, lat, polygon))
      // Side lighting and alternating ocean dots echo halftone print artwork.
      const light = Math.max(0, Math.min(1, 0.35 + 0.5 * z + 0.25 * x))
      line += continent ? ':=+*#@'[Math.floor(light * 5)] : radius > 0.94 ? ':' : (row + col) % 2 ? '.' : ' '
    }
    return line.trimEnd()
  })
}

// ─── Provider detection ───────────────────────────────────────────────────────

export function detectProvider(modelOverride?: string): { name: string; model: string; baseUrl: string; isLocal: boolean } {
  const useGemini = process.env.CLAUDE_CODE_USE_GEMINI === '1' || process.env.CLAUDE_CODE_USE_GEMINI === 'true'
  const useGithub = process.env.CLAUDE_CODE_USE_GITHUB === '1' || process.env.CLAUDE_CODE_USE_GITHUB === 'true'
  const useOpenAI = process.env.CLAUDE_CODE_USE_OPENAI === '1' || process.env.CLAUDE_CODE_USE_OPENAI === 'true'
  const useMistral = process.env.CLAUDE_CODE_USE_MISTRAL === '1' || process.env.CLAUDE_CODE_USE_MISTRAL === 'true'

  if (useGemini) {
    const model = modelOverride || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
    const baseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai'
    return { name: 'Google AI / Gemini', model, baseUrl, isLocal: false }
  }

  if (useMistral) {
    const model = modelOverride || process.env.MISTRAL_MODEL || 'devstral-latest'
    const baseUrl = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1'
    return { name: 'Mistral', model, baseUrl, isLocal: false }
  }

  if (useGithub) {
    const model = modelOverride || process.env.OPENAI_MODEL || 'github:copilot'
    const baseUrl =
      process.env.OPENAI_BASE_URL || 'https://api.githubcopilot.com'
    return { name: 'GitHub Copilot', model, baseUrl, isLocal: false }
  }

  if (useOpenAI) {
    const rawModel = modelOverride || process.env.OPENAI_MODEL || 'gpt-4o'
    const resolvedRequest = resolveProviderRequest({
      model: rawModel,
      baseUrl: process.env.OPENAI_BASE_URL,
    })
    const baseUrl = resolvedRequest.baseUrl
    const isLocal = isLocalProviderUrl(baseUrl)
    const routeId = resolveRouteIdFromBaseUrl(baseUrl)
    let name = 'OpenAI'
    // Explicit dedicated-provider env flags win.
    if (process.env.NVIDIA_NIM) name = 'NVIDIA NIM'
    else if (process.env.MINIMAX_API_KEY) name = 'MiniMax'
    else if (
      resolvedRequest.transport === 'codex_responses' ||
      baseUrl.includes('chatgpt.com/backend-api/codex')
    )
      name = 'Codex'
    // Base URL is authoritative — must precede rawModel checks so aggregators
    // (OpenRouter/Together/Groq) aren't mislabelled as DeepSeek/Kimi/etc.
    // when routed to models whose IDs contain a vendor prefix. See issue #855.
    else if (/openrouter/i.test(baseUrl)) name = 'OpenRouter'
    else if (/together/i.test(baseUrl)) name = 'Together AI'
    else if (/groq/i.test(baseUrl)) name = 'Groq'
    else if (/azure/i.test(baseUrl)) name = 'Azure OpenAI'
    else if (/nvidia/i.test(baseUrl)) name = 'NVIDIA NIM'
    else if (/minimax/i.test(baseUrl)) name = 'MiniMax'
    else if (/api\.kimi\.com/i.test(baseUrl)) name = 'Moonshot AI - Kimi Code'
    else if (routeId && routeId !== 'openai' && routeId !== 'custom')
      name = getRouteLabel(routeId) ?? name
    else if (/moonshot/i.test(baseUrl)) name = 'Moonshot AI - API'
    else if (/deepseek/i.test(baseUrl)) name = 'DeepSeek'
    else if (/mistral/i.test(baseUrl)) name = 'Mistral'
    else if (/atlascloud/i.test(baseUrl)) name = 'Atlas Cloud'
    // rawModel fallback — fires only when base URL is generic/custom.
    else if (/nvidia/i.test(rawModel)) name = 'NVIDIA NIM'
    else if (/minimax/i.test(rawModel)) name = 'MiniMax'
    else if (/\bkimi-for-coding\b/i.test(rawModel))
      name = 'Moonshot AI - Kimi Code'
    else if (/\bkimi-k/i.test(rawModel) || /moonshot/i.test(rawModel))
      name = 'Moonshot AI - API'
    else if (/deepseek/i.test(rawModel)) name = 'DeepSeek'
    else if (/mistral/i.test(rawModel)) name = 'Mistral'
    else if (/llama/i.test(rawModel)) name = 'Meta Llama'
    else if (/bankr/i.test(baseUrl)) name = 'Bankr'
    else if (/bankr/i.test(rawModel)) name = 'Bankr'
    else if (/atlas\.cloud/i.test(rawModel)) name = 'Atlas Cloud'
    else if (isLocal) name = getLocalOpenAICompatibleProviderLabel(baseUrl)
    
    // Resolve model alias to actual model name + reasoning effort
    let displayModel = resolvedRequest.resolvedModel
    if (resolvedRequest.reasoning?.effort) {
      displayModel = `${displayModel} (${resolvedRequest.reasoning.effort})`
    }
    
    return { name, model: displayModel, baseUrl, isLocal }
  }

  // Default: Anthropic - check settings.model first, then env vars
  const settings = getSettings_DEPRECATED() || {}
  const modelSetting = modelOverride || process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || settings.model || 'claude-sonnet-4-6'
  const resolvedModel = parseUserSpecifiedModel(modelSetting)
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'
  const isLocal = isLocalProviderUrl(baseUrl)
  const name = isMiniMaxBaseUrl(baseUrl) ? 'MiniMax' : 'Anthropic'
  return { name, model: resolvedModel, baseUrl, isLocal }
}

// ─── Box drawing ──────────────────────────────────────────────────────────────

function boxRow(content: string, width: number, rawLen: number, border: RGB): string {
  const pad = Math.max(0, width - 2 - rawLen)
  return `${ansiRgb(...border)}\u2502${RESET}${content}${' '.repeat(pad)}${ansiRgb(...border)}\u2502${RESET}`
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function printStartupScreen(modelOverride?: string, welcome = false): void {
  // Skip in non-interactive / CI / print mode
  if (process.env.CI || !process.stdout.isTTY) return

  process.stdout.write(formatStartupScreen(modelOverride, undefined, true, 0, !welcome) + '\n')
}

/** Shared by the initial terminal print and the scrollable fullscreen header. */
export function formatStartupScreen(modelOverride?: string, columns = process.stdout.columns || 80, showProviderDetails = true, globeRotation = 0, showTagline = showProviderDetails): string {

  const palette = resolveLogoPalette(getGlobalConfig().logoColor)
  const ACCENT = palette.accent
  const CREAM = palette.cream
  const DIMCOL = palette.dim
  const BORDER = palette.border
  const GRAD = palette.gradient

  const W = 62
  const centerPad = (visibleLen: number): string =>
    ' '.repeat(Math.max(0, Math.floor((columns - visibleLen) / 2)))
  const out: string[] = []

  out.push('')

  // Gradient logo \u2014 OPEN and CLAUDE side by side on one centered row; falls
  // back to the stacked two-block layout when the terminal is too narrow.
  // Each block is centered as a unit (one pad per block) so rows stay aligned.
  const open = LOGO_OPEN
  const claude = LOGO_CLAUDE
  const openWidth = Math.max(...open.map(row => row.length))
  const claudeWidth = Math.max(...claude.map(row => row.length))
  const oneRowWidth = openWidth + 2 + claudeWidth
  const fitsOneRow = columns >= oneRowWidth
  const logoLines = fitsOneRow
    ? open.map((row, i) => ({
        pad: centerPad(oneRowWidth),
        text: `${row.padEnd(openWidth)}  ${claude[i]}`.trimEnd(),
      }))
    : [
        ...open.map(row => ({ pad: centerPad(openWidth), text: row })),
        { pad: '', text: '' },
        ...claude.map(row => ({ pad: centerPad(claudeWidth), text: row.trimEnd() })),
      ]
  const total = logoLines.length
  for (let i = 0; i < total; i++) {
    const t = total > 1 ? i / (total - 1) : 0
    if (logoLines[i].text === '') {
      out.push('')
    } else {
      out.push(logoLines[i].pad + paintLine(logoLines[i].text, GRAD, t))
    }
  }

  out.push('')

  const globeWidth = Math.min(49, columns)
  const globe = globeLines(globeWidth,17,globeRotation)
  for (let i = 0; i < globe.length; i++) {
    out.push(centerPad(globeWidth) + paintLine(globe[i]!, GRAD, i / (globe.length - 1)))
  }
  out.push('')

  // The optional tagline is independent of the owner's startup information table.
  if (showTagline) {
    out.push(`${centerPad(BRAND_TAGLINE.length + 4)}${ansiRgb(...ACCENT)}\u2726${RESET} ${ansiRgb(...CREAM)}${BRAND_TAGLINE}${RESET} ${ansiRgb(...ACCENT)}\u2726${RESET}`)
    out.push('')
  }

  // Provider info box
  if (!showProviderDetails) {
    const versionText = `AMIRAHCO CLI v${MACRO.DISPLAY_VERSION ?? MACRO.VERSION}`
    out.push(`${centerPad(versionText.length)}${ansiRgb(...DIMCOL)}${versionText}${RESET}`, '')
    return out.join('\n')
  }
  const p = detectProvider(modelOverride)
  const boxPad = centerPad(W)
  out.push(`${boxPad}${ansiRgb(...BORDER)}\u2554${'\u2550'.repeat(W - 2)}\u2557${RESET}`)

  const lbl = (k: string, v: string, c: RGB = CREAM): [string, number] => {
    const padK = k.padEnd(9)
    return [` ${DIM}${ansiRgb(...DIMCOL)}${padK}${RESET} ${ansiRgb(...c)}${v}${RESET}`, ` ${padK} ${v}`.length]
  }

  const provC: RGB = p.isLocal ? [130, 175, 130] : ACCENT
  let [r, l] = lbl('Provider', p.name, provC)
  out.push(boxPad + boxRow(r, W, l, BORDER))
  ;[r, l] = lbl('Model', p.model)
  out.push(boxPad + boxRow(r, W, l, BORDER))
  const ep = p.baseUrl.length > 38 ? p.baseUrl.slice(0, 35) + '...' : p.baseUrl
  ;[r, l] = lbl('Endpoint', ep)
  out.push(boxPad + boxRow(r, W, l, BORDER))

  out.push(`${boxPad}${ansiRgb(...BORDER)}\u2560${'\u2550'.repeat(W - 2)}\u2563${RESET}`)

  const sC: RGB = p.isLocal ? [130, 175, 130] : ACCENT
  const sL = p.isLocal ? 'local' : 'cloud'
  const sRow = ` ${ansiRgb(...sC)}\u25cf${RESET} ${DIM}${ansiRgb(...DIMCOL)}${sL}${RESET}    ${DIM}${ansiRgb(...DIMCOL)}Ready \u2014 type ${RESET}${ansiRgb(...ACCENT)}/help${RESET}${DIM}${ansiRgb(...DIMCOL)} to begin${RESET}`
  const sLen = ` \u25cf ${sL}    Ready \u2014 type /help to begin`.length
  out.push(boxPad + boxRow(sRow, W, sLen, BORDER))

  out.push(`${boxPad}${ansiRgb(...BORDER)}\u255a${'\u2550'.repeat(W - 2)}\u255d${RESET}`)
  const versionText = `AMIRAHCO CLI v${MACRO.DISPLAY_VERSION ?? MACRO.VERSION}`
  out.push(`${centerPad(versionText.length)}${DIM}${ansiRgb(...DIMCOL)}AMIRAHCO CLI ${RESET}${ansiRgb(...ACCENT)}v${MACRO.DISPLAY_VERSION ?? MACRO.VERSION}${RESET}`)
  out.push('')

  return out.join('\n')
}
