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
        autocomplete="off"
        autocorrect="off"
        aria-autocomplete="none"
        placeholder="Type a command (e.g. select f3152000)"
      />
    </div>
  </form>
</template>

<style scoped>
.command-input {
  padding: 0.5rem;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
}
</style>
