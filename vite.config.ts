import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

function ensureDevtoolsStorage(): void {
  const storage = globalThis.localStorage as Storage | undefined
  if (typeof storage?.getItem === 'function') return

  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return values.size
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
}

// https://vite.dev/config/
export default defineConfig(async ({ command, mode }) => {
  if (command === 'serve') {
    ensureDevtoolsStorage()
  }

  const root = process.cwd()
  const env = loadEnv(mode, root, '')
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:8080'
  const wsTarget = env.VITE_WS_TARGET || 'ws://localhost:8081'
  const plugins: Plugin[] = [
    vue({
      template: {
        compilerOptions: {
          // treat all components with a dash as custom elements
          isCustomElement: (tag) => tag.includes('stripe-pricing-table'),
        },
      },
    }),
    tailwindcss(),
  ]

  if (command === 'serve') {
    const { default: vueDevTools } = await import('vite-plugin-vue-devtools')
    plugins.push(vueDevTools())
  }

  return {
    envDir: root,
    plugins,
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
        '/ws': {
          target: wsTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
          xfwd: true,
        },
        // Forward frontend calls to /api -> backend API server, avoiding CORS in dev
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          xfwd: true,
        },
      },
    },
    build: {
      cssMinify: false,
    },
  }
})
