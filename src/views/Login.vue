<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="login-view">
    <div class="terminal">
      <div class="titlebar">
        <div class="traffic">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
        </div>
        <div class="title">trad login — tty1</div>
        <div class="right">
          <WsIndicator />
        </div>
      </div>

      <div class="screen">
        <pre class="banner">TRAD v0.1 — secure login</pre>
        <p v-if="!ws.isConnected" class="hint">waiting for server connection…</p>

        <div class="prompt-line">
          <span class="chevron">❯</span>
          <label for="username">username</label>
          <input
            id="username"
            v-model="usernameInput"
            type="text"
            placeholder=""
            @keyup.enter="submit"
            :disabled="submitting"
            autofocus
          />
        </div>

        <div class="prompt-line">
          <span class="chevron">❯</span>
          <label for="password">password</label>
          <input
            id="password"
            v-model="passwordInput"
            type="password"
            placeholder=""
            @keyup.enter="submit"
            :disabled="submitting"
          />
        </div>

        <div class="actions">
          <button
            class="button submit"
            :disabled="submitting || !usernameInput || !passwordInput || !ws.isConnected"
            @click="submit"
          >
            {{ submitting ? 'authenticating…' : '⏎ login' }}
          </button>
          <span class="hint">Press Enter to submit</span>
        </div>

        <p v-if="error" class="error">✖ {{ error }}</p>
        <p v-if="auth.isAuthenticated" class="ok">✔ Already authenticated.</p>
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
    // Connect WS with token then navigate
    ws.setAuthToken(auth.token)
    if (ws.status === 'idle') ws.connect()
    router.push('/terminal')
  }
}

onMounted(() => {
  if (auth.isAuthenticated) router.replace('/terminal')
})
</script>

<style scoped>
.login-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
}

.terminal {
  /* local terminal palette */
  --term-bg: #0b0f14;
  --term-fg: #e6edf3;
  --term-dim: #8b949e;
  --term-accent: var(--accent-color, #2f81f7);
  --term-border: #1f2630;
  --term-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
  --term-ok: var(--color-success, #4ade80);
  --term-err: var(--color-error, #f87171);

  background: var(--term-bg);
  color: var(--term-fg);
  border: 1px solid var(--term-border);
  border-radius: 10px;
  box-shadow: var(--term-shadow);
  width: min(720px, 92vw);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  position: relative;
  overflow: hidden;
}

.terminal::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.03),
    rgba(255, 255, 255, 0.03) 1px,
    transparent 1px,
    transparent 2px
  );
  mix-blend-mode: overlay;
  opacity: 0.12;
  animation: crt-flicker 8s infinite ease-in-out;
}

@keyframes crt-flicker {
  0%,
  100% {
    opacity: 0.1;
  }
  50% {
    opacity: 0.16;
  }
}

.titlebar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--term-border);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(0, 0, 0, 0.15));
}
.traffic {
  display: inline-flex;
  gap: 6px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.6),
    inset 0 0 6px rgba(0, 0, 0, 0.65);
}
.dot.red {
  background: #ff5f56;
}
.dot.yellow {
  background: #ffbd2e;
}
.dot.green {
  background: #27c93f;
}
.title {
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--term-dim);
}
.titlebar .right {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.screen {
  padding: 1rem 1.25rem 1.25rem 1.25rem;
}

.banner {
  margin: 0 0 1rem 0;
  font-size: 12px;
  color: var(--term-dim);
}

.prompt-line {
  display: grid;
  grid-template-columns: 1.25rem auto 1fr;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0;
}
.prompt-line .chevron {
  color: var(--term-accent);
}
.prompt-line label {
  color: var(--term-dim);
  font-size: 13px;
}
.prompt-line input {
  background: transparent;
  border: none;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.12);
  padding: 4px 2px 3px 2px;
  color: var(--term-fg);
  caret-color: var(--term-accent);
  font-family: inherit;
  font-size: 13px;
}
.prompt-line input:focus {
  outline: none;
  border-bottom: 1px solid var(--term-accent);
}
.prompt-line input:disabled {
  opacity: 0.6;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
.submit {
  padding: 4px 8px;
  font-size: 12px;
  text-transform: lowercase;
}
.hint {
  font-size: 12px;
  color: var(--term-dim);
}

.error {
  color: var(--term-err);
  font-size: 12px;
  margin-top: 0.75rem;
}
.ok {
  color: var(--term-ok);
  font-size: 12px;
  margin-top: 0.75rem;
}
</style>
