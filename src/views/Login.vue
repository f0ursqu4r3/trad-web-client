<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { useWsStore } from '@/stores/ws'

const auth = useAuthStore()
const ws = useWsStore()
const router = useRouter()

const tokenInput = ref('')
const submitting = computed(() => auth.status === 'authenticating')
const error = computed(() => auth.lastError)

async function submit() {
  if (!tokenInput.value.trim()) return
  await auth.login(tokenInput.value)
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

<template>
  <div class="login-view">
    <div class="card">
      <h1>Login</h1>
      <label class="field">
        <span>Auth Token</span>
        <input
          v-model="tokenInput"
          placeholder="Paste token"
          @keyup.enter="submit"
          :disabled="submitting"
          autofocus
        />
      </label>
      <button class="submit" :disabled="submitting || !tokenInput" @click="submit">
        {{ submitting ? 'Authenticating…' : 'Login' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="auth.isAuthenticated" class="ok">Already authenticated.</p>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
}
.card {
  background: #1e1f24;
  border: 1px solid #333;
  padding: 2rem 2.5rem;
  border-radius: 12px;
  width: 340px;
  box-shadow: 0 4px 18px -4px rgba(0, 0, 0, 0.6);
  font-family: ui-sans-serif, system-ui;
}
.card h1 {
  margin: 0 0 1.25rem;
  font-size: 1.4rem;
  font-weight: 600;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}
.field input {
  padding: 0.6rem 0.7rem;
  border-radius: 6px;
  border: 1px solid #444;
  background: #25272d;
  color: #eee;
  font-family: monospace;
}
.field input:focus {
  outline: 2px solid #3a7afe;
  border-color: #3a7afe;
}
.submit {
  width: 100%;
  padding: 0.7rem 0.9rem;
  border-radius: 6px;
  border: none;
  background: #3a7afe;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.submit:disabled {
  opacity: 0.5;
  cursor: default;
}
.submit:not(:disabled):hover {
  background: #2866e3;
}
.error {
  color: #ff5252;
  font-size: 0.75rem;
  margin-top: 0.75rem;
}
.ok {
  color: #4caf50;
  font-size: 0.75rem;
  margin-top: 0.75rem;
}
</style>
