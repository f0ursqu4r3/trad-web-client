import { createLogger } from './src/lib/utils'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http'
type NextFunction = (err?: unknown) => void
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const logger = createLogger('vite')

type StorageLike = {
  readonly length: number
  clear(): void
  getItem(key: string): string | null
  key(index: number): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

function createMemoryLocalStorage(): StorageLike {
  const entries = new Map<string, string>()

  return {
    get length() {
      return entries.size
    },
    clear() {
      entries.clear()
    },
    getItem(key: string) {
      return entries.get(key) ?? null
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null
    },
    removeItem(key: string) {
      entries.delete(key)
    },
    setItem(key: string, value: string) {
      entries.set(key, value)
    },
  }
}

function isUsableLocalStorage(value: unknown): value is StorageLike {
  const storage = value as Partial<StorageLike> | undefined

  return (
    storage !== undefined &&
    storage !== null &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function' &&
    typeof storage.removeItem === 'function'
  )
}

function ensureConfigLocalStorage(): void {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  if (
    storageDescriptor &&
    'value' in storageDescriptor &&
    isUsableLocalStorage(storageDescriptor.value)
  ) {
    return
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: createMemoryLocalStorage(),
  })
}

function applyEnvToProcess(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value
  }
}

function createClientEnvDefines(env: Record<string, string>): Record<string, string> {
  return Object.entries(env).reduce<Record<string, string>>((defines, [key, value]) => {
    if (key.startsWith('VITE_')) {
      defines[`import.meta.env.${key}`] = JSON.stringify(value)
    }
    return defines
  }, {})
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  ensureConfigLocalStorage()
  const { default: vueDevTools } = await import('vite-plugin-vue-devtools')

  const root = process.cwd()
  const env = loadEnv(mode, root, '')
  applyEnvToProcess(env)
  const apiTarget = env.VITE_API_TARGET || env.API_TARGET || 'http://localhost:8080'
  const preserveApiPrefix = (env.VITE_API_PRESERVE_PREFIX || '').toLowerCase() === 'true'

  const loggerPlugin: Plugin = {
    name: 'vite:logger',
    configResolved(_resolvedConfig) {
      logger.log(`mode=${mode} apiTarget=${apiTarget} preserveApiPrefix=${preserveApiPrefix}`)
    },
    configureServer(server: ViteDevServer) {
      const host =
        typeof server.config.server.host === 'string' ? server.config.server.host : 'localhost'
      const port = server.config.server.port ?? 'unknown'
      logger.log(`dev server starting on ${host}:${port}`)

      // log every incoming HTTP request (before proxy)
      server.middlewares.use((req: IncomingMessage, _res: ServerResponse, next: NextFunction) => {
        try {
          logger.debug(`${req.method} ${req.url}`)
        } catch {
          /* ignore */
        }
        next()
      })
    },
  }
  return {
    envDir: root,
    define: createClientEnvDefines(env),
    plugins: [
      // simple logger plugin for dev-time visibility
      loggerPlugin,
      vue({
        template: {
          compilerOptions: {
            // treat all components with a dash as custom elements
            isCustomElement: (tag) => tag.includes('stripe-pricing-table'),
          },
        },
      }),
      vueDevTools(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/auth': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          xfwd: true,
        },
        // Forward frontend calls to /api -> backend API server, avoiding CORS in dev
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          // Optionally remove the /api prefix when forwarding (default remove)
          rewrite: (path: string) => {
            if (preserveApiPrefix) return path
            // Remove only the leading /api segment and keep the rest of the path
            const rewritten = path.replace(/^\/api(?=\/|$)/, '')
            // Ensure we always forward at least '/'
            return rewritten === '' ? '/' : rewritten
          },
          // Some gateways route/validate based on the Origin header; in dev this would be 127.0.0.1:5173.
          // Force Origin to the target origin so the gateway recognizes the service.
          configure: (proxy: {
            on(
              event: 'proxyReq',
              listener: (proxyReq: ClientRequest, req: IncomingMessage) => void,
            ): void
            on(
              event: 'proxyRes',
              listener: (proxyRes: IncomingMessage, req: IncomingMessage) => void,
            ): void
            on(event: 'error', listener: (err: Error, req: IncomingMessage) => void): void
          }) => {
            const targetOrigin = new URL(apiTarget).origin
            proxy.on('proxyReq', (proxyReq: ClientRequest, req: IncomingMessage) => {
              try {
                proxyReq.setHeader('origin', targetOrigin)
                // Optionally align referer as well
                proxyReq.setHeader('referer', targetOrigin + '/')
              } catch {
                /* ignore */
              }
              // log proxied request
              try {
                const destUrl = new URL(req.url || '/', apiTarget).toString()
                logger.debug(`proxy: ${req.method} ${req.url} -> ${destUrl}`)
              } catch {
                /* ignore */
              }
            })

            proxy.on('proxyRes', (proxyRes: IncomingMessage, req: IncomingMessage) => {
              try {
                const destUrl = new URL(req.url || '/', apiTarget).toString()
                logger.debug(`proxy: ${req.method} ${req.url} <- ${destUrl} ${proxyRes.statusCode}`)
              } catch {
                /* ignore */
              }
            })

            proxy.on('error', (err: Error, req: IncomingMessage) => {
              try {
                logger.error(
                  `proxy error: ${req?.method} ${req?.url}`,
                  err && err.message ? err.message : err,
                )
              } catch {
                /* ignore */
              }
            })
          },
        },
      },
    },
    build: {
      cssMinify: false,
    },
  }
})
