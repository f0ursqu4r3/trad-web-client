<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="terminal-card">
      <!-- Titlebar -->
      <div
        class="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 border-b border-slate-800 bg-gradient-to-b from-white/5 to-black/20"
      >
        <div class="inline-flex gap-1.5">
          <span
            v-for="color in ['#ff5f56', '#ffbd2e', '#27c93f']"
            :key="color"
            class="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/60 [box-shadow:inset_0_0_6px_rgba(0,0,0,0.65)]"
            :style="{ backgroundColor: color }"
          ></span>
        </div>
        <div class="text-center text-[12px] tracking-wider text-slate-400">trad login — tty1</div>
        <div class="inline-flex items-center gap-2">
          <WsIndicator />
        </div>
      </div>

      <!-- Screen -->
      <div class="p-5 pt-4">
        <pre class="m-0 mb-4 text-[12px] text-term-dim">TRAD v0.1 — secure login</pre>
        <p v-if="!ws.isConnected" class="mb-2 muted">waiting for server connection…</p>

        <!-- Username -->
        <div class="prompt-row">
          <span class="prompt-chevron">❯</span>
          <label for="username" class="prompt-label">username</label>
          <input
            id="username"
            v-model="usernameInput"
            type="text"
            placeholder=""
            @keyup.enter="submit"
            :disabled="submitting"
            autofocus
            class="input-term"
          />
        </div>

        <!-- Password -->
        <div class="prompt-row">
          <span class="prompt-chevron">❯</span>
          <label for="password" class="prompt-label">password</label>
          <input
            id="password"
            v-model="passwordInput"
            type="password"
            placeholder=""
            @keyup.enter="submit"
            :disabled="submitting"
            class="input-term"
          />
        </div>

        <!-- Actions -->
        <div class="mt-3 flex items-center gap-3">
          <button
            class="btn-primary"
            :disabled="submitting || !usernameInput || !passwordInput || !ws.isConnected"
            @click="submit"
          >
            {{ submitting ? 'authenticating…' : '⏎ login' }}
          </button>
          <span v-if="!submitting" class="muted">Press Enter to submit</span>
        </div>

        <p v-if="error" class="mt-3 text-[12px] text-term-err">✖ {{ error }}</p>
        <p v-if="auth.isAuthenticated" class="mt-3 text-[12px] text-term-ok">
          ✔ Already authenticated.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { useWsStore } from '@/stores/ws'

import WsIndicator from '@/components/general/WsIndicator.vue'

const auth = useAuthStore()
const ws = useWsStore()
const router = useRouter()

const usernameInput = ref('')
const passwordInput = ref('')
const submitting = computed(() => auth.status === 'authenticating')
const error = computed(() => auth.lastError)

async function submit() {
  if (!usernameInput.value.trim() || !passwordInput.value.trim()) return
  await auth.login(usernameInput.value, passwordInput.value)
  if (auth.isAuthenticated) {
    if (ws.status === 'idle') ws.connect()
    router.push('/terminal')
  }
}

onMounted(() => {
  if (auth.isAuthenticated) router.replace('/terminal')
})
</script>
