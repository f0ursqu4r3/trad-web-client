<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="login-wrap">
    <div class="terminal-card shadow-term login-card">
      <!-- Header / brand -->
      <div class="panel-header-row">
        <div class="flex items-center gap-2">
          <img src="/favicon.png" alt="TRAD" class="h-5 w-5 rounded-sm" />
          <span class="tracking-wide">TRAD Terminal</span>
        </div>
        <div class="toolbar-section gap-1">
          <button
            class="icon-btn"
            :title="themeToggleLabel"
            :aria-label="themeToggleLabel"
            @click="ui.toggleTheme()"
          >
            <component :is="themeIcon" :size="16" />
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="p-4 sm:p-6">
        <h1 class="text-xl mb-1">Sign in</h1>
        <p class="muted">Access your trading workspace with your Auth0 account.</p>

        <div class="section-divider" />

        <div class="space-y-3">
          <button v-if="!isAuthenticated" class="btn-primary w-full" @click="login">
            Continue with Auth0
          </button>

          <div v-else class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="text-[13px]">
                <span class="muted">Signed in as</span>
                <span class="ml-1">{{ userLabel }}</span>
              </div>
              <button class="btn-secondary btn-sm" @click="logoutUser">Logout</button>
            </div>
            <button class="btn-primary w-full" @click="goTerminal">Go to terminal</button>
          </div>
        </div>

        <p class="notice mt-4">
          By continuing, you agree to our
          <a href="#" class="link-term">Terms</a> and
          <a href="#" class="link-term">Privacy Policy</a>.
        </p>

        <div class="section-divider" />

        <div class="flex items-center justify-between">
          <span class="muted">Need an account? Contact your administrator.</span>
          <button class="btn-sm btn-secondary" @click="showDebug = !showDebug">
            {{ showDebug ? 'Hide' : 'Show' }} debug
          </button>
        </div>

        <transition name="fade">
          <div v-if="showDebug" class="mt-3 text-[12px]">
            <div class="grid grid-cols-[10rem_1fr] gap-2">
              <div class="muted">Auth0 isAuthenticated</div>
              <div>
                <span class="pill" :class="isAuthenticated ? 'pill-ok' : 'pill-err'">{{
                  isAuthenticated ? 'true' : 'false'
                }}</span>
              </div>
              <div class="muted">Auth0 user</div>
              <div>
                <pre class="code-inline whitespace-pre-wrap leading-snug">{{ user }}</pre>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useRouter } from 'vue-router'
import { SunIcon, MoonIcon } from '@/components/icons'

const ui = useUiStore()
const auth = useAuthStore()
const router = useRouter()

const { loginWithRedirect, logout, isAuthenticated, user } = useAuth0()

const themeIcon = computed(() => (ui.theme === 'dark' ? SunIcon : MoonIcon))
const themeToggleLabel = computed(() =>
  ui.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
)

const showDebug = ref(false)

interface Auth0UserLike {
  name?: string
  email?: string
  nickname?: string
}
const userLabel = computed(() => {
  const u = (user?.value ?? {}) as Auth0UserLike
  return u.name || u.email || u.nickname || 'user'
})

const login = async () => {
  await loginWithRedirect()
}

const logoutUser = async () => {
  await logout({ logoutParams: { returnTo: window.location.origin } })
}

const goTerminal = () => router.push('/terminal')

onMounted(() => {
  if (auth.isAuthenticated) router.replace('/terminal')
})
</script>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  /* subtle background texture using theme vars */
  background:
    radial-gradient(
      1200px 600px at 10% -10%,
      color-mix(in srgb, var(--accent-color) 12%, transparent),
      transparent
    ),
    radial-gradient(
      1000px 500px at 110% 10%,
      color-mix(in srgb, var(--accent-color) 10%, transparent),
      transparent
    ),
    var(--color-bg);
}

.login-card {
  width: 100%;
  max-width: 560px;
}

/* simple fade for debug */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
