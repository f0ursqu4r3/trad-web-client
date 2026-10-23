<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { agentExpiryNotices, type AgentExpiryAccount } from '@/lib/agentExpiry'

// Warns from 7 days before a Hyperliquid agent wallet expires. The node
// refuses new trades on the account from 24 hours before; after the expiry
// nothing can be signed, exits included. Never hidden while it applies.
const props = defineProps<{ accounts: readonly AgentExpiryAccount[] }>()

const now = ref(Date.now())
let timer: number | null = null
onMounted(() => {
  timer = window.setInterval(() => (now.value = Date.now()), 30_000)
})
onBeforeUnmount(() => {
  if (timer !== null) window.clearInterval(timer)
})

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const notices = computed(() =>
  agentExpiryNotices(props.accounts, now.value, (ms) => timeFormat.format(ms)),
)
</script>

<template>
  <div v-if="notices.length > 0" class="agent-expiry-list" data-testid="agent-expiry">
    <aside
      v-for="notice in notices"
      :key="notice.accountId"
      class="agent-expiry"
      :class="`agent-expiry--${notice.severity}`"
      :role="notice.severity === 'error' ? 'alert' : 'status'"
      :data-state="notice.state"
    >
      <div class="agent-expiry__text">
        <strong>{{ notice.title }}</strong>
        <span>{{ notice.detail }}</span>
      </div>
      <RouterLink
        :to="`/settings/accounts/${notice.accountId}/authorization`"
        class="btn btn-sm agent-expiry__action"
        >Renew agent approval</RouterLink
      >
    </aside>
  </div>
</template>

<style scoped>
.agent-expiry-list {
  display: flex;
  flex: none;
  flex-direction: column;
}
.agent-expiry {
  --_tone: var(--state-warning);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  color: var(--fg-strong);
  font-size: 12px;
  line-height: 1.45;
  background: color-mix(in srgb, var(--_tone) 10%, var(--surface-base));
  border-bottom: 1px solid color-mix(in srgb, var(--_tone) 55%, var(--border-normal));
  border-left: 3px solid var(--_tone);
}
.agent-expiry--error {
  --_tone: var(--state-error);
}
.agent-expiry__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.1rem;
}
.agent-expiry__action {
  flex: none;
  white-space: nowrap;
}
@media (max-width: 650px) {
  .agent-expiry {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
