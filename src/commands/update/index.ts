import type { Command } from '../../types/command.js'

const update = {
  type: 'local-jsx',
  name: 'update',
  description: 'Update AmirahCo CLI to the latest version',
  argumentHint: '',
  load: () => import('./update.js'),
} satisfies Command

export default update
