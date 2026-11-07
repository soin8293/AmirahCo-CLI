import type {Command} from '../../commands.js'
export default {
  type:'local-jsx',name:'start',description:'AMIRAHCO home and saved project intake',
  immediate:true,dialogLayout:'docked',load:()=>import('./start.js'),
} satisfies Command
