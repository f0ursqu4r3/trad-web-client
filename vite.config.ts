import { execFileSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

import releases from './src/content/releases.json' with { type: 'json' }

interface CurrentRelease {
  version: string
  status: 'draft' | 'published'
}

// The header and telemetry need only the current release, so it is compiled
// in from the notes here; the notes themselves load with the Updates view
// (src/lib/releaseNotes.ts). Development shows drafts, so its current release
// is the newest entry; a build's is the newest published one.
function currentReleases(): { development: CurrentRelease; published: CurrentRelease } {
  const entries = releases as CurrentRelease[]
  const pick = ({ version, status }: CurrentRelease): CurrentRelease => ({ version, status })
  const newest = entries[0]
  if (!newest) throw new Error('src/content/releases.json has no release')
  const published = entries.find((release) => release.status === 'published') ?? newest
  return { development: pick(newest), published: pick(published) }
}

// The commit a bundle is built from: telemetry's client_commit and the
// Updates page's build. VITE_APP_BUILD wins; otherwise the checkout's short
// sha. Builds left it unset and every client reported "0000000"
// (2026-10-29). Release builds come from a clean checkout of the release
// commit (backend docs/releasing.md).
function buildCommit(root: string, configured: string | undefined): string | null {
  const value = configured?.trim()
  if (value) return value
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return /^[0-9a-f]{7,64}$/.test(sha) ? sha : null
  } catch {
    return null
  }
}

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
  const commit = buildCommit(root, env.VITE_APP_BUILD)
  const plugins: PluginOption[] = [
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
    define: {
      __TRAD_CURRENT_RELEASES__: JSON.stringify(currentReleases()),
      ...(commit === null ? {} : { 'import.meta.env.VITE_APP_BUILD': JSON.stringify(commit) }),
    },
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
