import { expect, test } from 'bun:test'
import { stripVTControlCharacters } from 'node:util'
import { stringWidth } from '../../ink/stringWidth.js'
import { renderElricMatrix, selectElricMask } from './elricMatrix.js'

test('the cutout selects a complete face within each available width and height', () => {
  for (const [columns, rows] of [[112, 40], [78, 40], [48, 24], [30, 12], [18, 6]]) {
    const mask = selectElricMask(columns!, rows!)
    expect(mask).toBeDefined()
    expect(mask!.columns).toBeLessThanOrEqual(columns!)
    expect(mask!.rows).toBeLessThanOrEqual(rows!)
    expect(mask!.mask.every(line => line.length === mask!.columns)).toBe(true)
  }
  expect(selectElricMask(12)).toBeUndefined()
})

test('animation changes code inside the original silhouette without resizing or filling the background', () => {
  const mask = selectElricMask(100)!
  const original = JSON.stringify(mask)
  const first = stripVTControlCharacters(renderElricMatrix(mask, 0)).split('\n')
  for (const frame of [4, 12, 64, 9999999]) {
    const lines = stripVTControlCharacters(renderElricMatrix(mask, frame)).split('\n')
    expect(lines).toHaveLength(mask.rows)
    expect(lines).not.toEqual(first)
    for (let y = 0; y < lines.length; y++) {
      expect(stringWidth(lines[y]!)).toBe(mask.columns)
      expect([...lines[y]!].map(c => c === ' ')).toEqual([...mask.mask[y]!].map(c => c === ' '))
    }
  }
  expect(JSON.stringify(mask)).toBe(original)
  expect(stripVTControlCharacters(renderElricMatrix(mask, 0, true))).toBe(first.join('\n'))
  expect(renderElricMatrix(mask, 0, true)).not.toBe(renderElricMatrix(mask, 0))
})
