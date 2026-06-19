import { createServer } from 'vite'

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
})

try {
  const smoke = await server.ssrLoadModule('/src/lib/bybitFilterSmoke.ts')
  smoke.runBybitFilterSmoke()
  console.log('Bybit frontend filter smoke passed')
} finally {
  await server.close()
}
