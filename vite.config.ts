import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || env.API_TARGET || 'http://localhost:8080'
  const preserveApiPrefix = (env.VITE_API_PRESERVE_PREFIX || '').toLowerCase() === 'true'
  return {
    plugins: [vue(), vueDevTools(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        // Forward frontend calls to /api -> backend API server, avoiding CORS in dev
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          // Optionally remove the /api prefix when forwarding (default remove)
          rewrite: (path) => (preserveApiPrefix ? path : path.replace(/^\/api/, '')),
          // Some gateways route/validate based on the Origin header; in dev this would be 127.0.0.1:5173.
          // Force Origin to the target origin so the gateway recognizes the service.
          configure: (proxy) => {
            const targetOrigin = new URL(apiTarget).origin
            proxy.on('proxyReq', (proxyReq) => {
              try {
                proxyReq.setHeader('origin', targetOrigin)
                // Optionally align referer as well
                proxyReq.setHeader('referer', targetOrigin + '/')
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
