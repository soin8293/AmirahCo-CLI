import { describe, expect, test } from 'bun:test'
import { withMockMacro } from 'src/test/mockMacro.js'
import {
  getGlobalUpdateFailureHint,
  writePackageManagerUpdateGuidance,
} from './update.js'

describe('getGlobalUpdateFailureHint', () => {
  test('points AmirahCo builds at the product update flow', () => {
    withMockMacro({ PACKAGE_URL: '@amirahco/cli' }, () => {
      expect(getGlobalUpdateFailureHint(false)).toContain(
        '/update',
      )
      expect(getGlobalUpdateFailureHint(false)).not.toContain(
        'amirahcocli install',
      )
    })
  })

  test('preserves native installer guidance for native-capable builds', () => {
    withMockMacro({PACKAGE_URL:'@example/custom-cli'},()=>{
    expect(getGlobalUpdateFailureHint(true)).toBe(
      'Or consider using native installation with: amirahcocli install\n',
    )
    })
  })
})

describe('writePackageManagerUpdateGuidance', () => {
  test.each([
    ['@anthropic-ai/claude-code', true],
    ['@amirahco/cli', false],
    ['@example/custom-cli', false],
  ] as const)(
    'uses the runtime package identity for %s',
    async (packageUrl, expectsUpstreamCommand) => {
      let output = ''

      await withMockMacro({ PACKAGE_URL: packageUrl }, async () => {
        await writePackageManagerUpdateGuidance('homebrew', 'latest', {
          displayVersion: '1.0.0',
          getLatestVersion: async () => '2.0.0',
          write: value => {
            output += value
          },
          bold: value => value,
        })
      })

      expect(output).toContain(
        'AmirahCo CLI is managed by Homebrew. Use Homebrew to update AmirahCo CLI.',
      )
      expect(output).toContain('Update available: 1.0.0 → 2.0.0')
      if (expectsUpstreamCommand) {
        expect(output).toContain('brew upgrade claude-code')
      } else {
        expect(output).not.toContain('brew upgrade claude-code')
        expect(output).not.toContain('Anthropic.ClaudeCode')
        expect(output).not.toContain('apk upgrade claude-code')
      }
    },
  )
})
