import art from './elricMatrixMask.json'

export type ElricMask = (typeof art.sizes)[number]
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789'
const DARK = ['\x1b[38;2;4;120;87m', '\x1b[38;2;16;185;129m', '\x1b[38;2;52;211;153m', '\x1b[38;2;110;231;183m']
const LIGHT = ['\x1b[38;2;6;78;59m', '\x1b[38;2;4;100;75m', '\x1b[38;2;4;120;87m', '\x1b[38;2;5;135;95m']

export function selectElricMask(columns: number, maxRows = Infinity): ElricMask | undefined {
  return art.sizes.find(size => size.columns <= columns && size.rows <= maxRows)
}

export function renderElricMatrix(mask: ElricMask, frame = 0, light = false): string {
  const palette = light ? LIGHT : DARK
  return mask.mask.map((row, y) => {
    let result = '\x1b[1m', previous = -1
    for (let x = 0; x < row.length; x++) {
      const value = row[x]!
      if (value === ' ') { result += ' '; continue }
      const trail = ((y - Math.floor(frame / 2) - x * 7 % mask.rows) % mask.rows + mask.rows) % mask.rows
      const shade = Math.min(3, (Number(value) > 6 ? 1 : 0) + (trail < 2 ? 2 : trail < 6 ? 1 : 0))
      if (shade !== previous) { result += palette[shade]; previous = shade }
      const seed = x * 17 + y * 31
      const tick = Math.floor((frame + x % 4) / 4)
      result += GLYPHS[(seed + tick) % GLYPHS.length]
    }
    return result + '\x1b[0m'
  }).join('\n')
}
