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
    <div class="prompt-line" style="flex: 1">
      <span class="chevron">❯</span>
      <label for="terminal-cmd" class="dim">command</label>
      <input
        id="terminal-cmd"
        v-model="command"
        class="mono"
        placeholder="Type a command (e.g. select f3152000)"
      />
    </div>
    <button class="button is-small" type="submit">Send</button>
  </form>
</template>

<style scoped>
.command-input {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
}

.button {
  background: var(--accent-color);
  color: #fff;
  border: none;
}
</style>
