import { expect, test } from 'bun:test'
import { snowLeopardLines } from './snowLeopardArt.js'

test('Elric keeps one footprint when blinking and uses portable ASCII', () => {
  const open = snowLeopardLines()
  const closed = snowLeopardLines(true)
  expect(open).toHaveLength(15)
  expect(closed).toHaveLength(open.length)
  expect(new Set([...open, ...closed].map(line => line.length))).toEqual(new Set([38]))
  expect(open.join('\n')).toMatch(/^[\x20-\x7e\n]+$/)
  expect(closed.filter((line, index) => line !== open[index])).toHaveLength(1)
  expect(open.join('\n')).toContain('. o . o .')
})
