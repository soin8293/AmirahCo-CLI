import { z } from 'zod'

export const testerFirebaseConfigSchema=z.object({
  projectId:z.literal('amirahcous'),appId:z.literal('1:682616290623:web:85e21b3eb80da1ae39278a'),
  authDomain:z.literal('amirahcous.firebaseapp.com'),apiKey:z.string().regex(/^AIza[A-Za-z0-9_-]{30,60}$/),
})
