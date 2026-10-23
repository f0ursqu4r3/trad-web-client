<script setup lang="ts">
import { computed } from 'vue'

import { historyErrorText, type HistoryPagerState } from '@/composables/useHistoryPager'

// The end of a paged history list: load more, loading, backing off, failed
// (with a retry) or finished.

const props = defineProps<{
  state: HistoryPagerState<unknown>
  moreLabel: string
  loadingLabel: string
  doneLabel: string
  emptyLabel: string
}>()
const emit = defineEmits<{ (event: 'load'): void }>()

const waitSeconds = computed(() =>
  props.state.waitingMs === null ? null : Math.max(1, Math.round(props.state.waitingMs / 1_000)),
)
</script>

<template>
  <div class="history-footer" :data-status="state.status" data-testid="history-footer">
    <p v-if="state.status === 'waiting'" role="status">
      The server asked Trad to slow down; retrying in {{ waitSeconds }} s.
    </p>
    <p v-else-if="state.status === 'loading'" role="status">{{ loadingLabel }}</p>
    <template v-else-if="state.status === 'error' && state.error">
      <p role="alert">{{ historyErrorText(state.error) }}</p>
      <button class="btn btn-sm" type="button" @click="emit('load')">Try again</button>
    </template>
    <p v-else-if="state.status === 'done'">
      {{ state.items.length === 0 ? emptyLabel : doneLabel }}
    </p>
    <button v-else class="btn btn-sm" type="button" @click="emit('load')">{{ moreLabel }}</button>
  </div>
</template>

<style scoped>
.history-footer {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.35rem 0.75rem;
  color: var(--fg-muted);
  font-size: 12px;
  text-align: center;
}
.history-footer p {
  margin: 0;
}
.history-footer[data-status='error'] p {
  color: var(--state-warning);
}
</style>
