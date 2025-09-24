<script setup lang="ts">
import { ref } from 'vue'
import { useTerminalStore } from '@/stores/terminal'

const terminal = useTerminalStore()
const command = ref('')
function submit() {
  if (!command.value.trim()) return
  terminal.parseCommand(command.value)
  command.value = ''
}
</script>

<template>
  <form class="command-input" @submit.prevent="submit">
    <input v-model="command" class="input" placeholder="Type a command (e.g. select f3152000)" />
    <button class="button is-small" type="submit">Send</button>
  </form>
</template>

<style scoped>
.command-input {
  display: flex;
  gap: 6px;
  padding: 4px;
}

.input {
  flex: 1;
  background: var(--color-bg-alt);
  color: var(--color-text);
  border: 1px solid var(--border-color);
  font-family: var(--font-mono);
  font-size: 12px;
}

.button {
  background: var(--accent-color);
  color: #fff;
  border: none;
}
</style>
