<script setup lang="ts">
import { ref } from 'vue'
import { Settings, WalletCards, Plus } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import GuidedPointer from '@/components/general/GuidedPointer.vue'

const router = useRouter()
const touring = ref(false)

function startSetup(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    void router.push({ path: '/settings/accounts', query: { create: '1' } })
    return
  }
  touring.value = true
}

function openSettings(): void {
  void router.push({ path: '/settings/profile', query: { tour: 'accounts' } })
}
</script>

<template>
  <main class="terminal-empty-state">
    <section class="terminal-empty-card" aria-labelledby="terminal-empty-title">
      <div class="terminal-empty-icon"><WalletCards :size="24" /></div>
      <h1 id="terminal-empty-title">Add a trading account to get started</h1>
      <p>
        Connect an exchange account, complete its required approvals, and Trad will bring you back
        to a command-ready terminal.
      </p>
      <div class="terminal-empty-route" aria-hidden="true">
        <span><Settings :size="13" /> Settings</span>
        <i>→</i>
        <span><WalletCards :size="13" /> Trading accounts</span>
        <i>→</i>
        <span><Plus :size="13" /> New account</span>
      </div>
      <button
        class="btn btn-primary terminal-empty-action"
        type="button"
        :disabled="touring"
        @click="startSetup"
      >
        <Plus :size="14" /> {{ touring ? 'Opening settings…' : 'Add trading account' }}
      </button>
      <small
        >You can return to the terminal at any time. Nothing is submitted until you save.</small
      >
    </section>
    <GuidedPointer
      v-if="touring"
      source-selector=".terminal-empty-action"
      target-selector="[data-tour='terminal-settings']"
      @arrive="openSettings"
    />
  </main>
</template>

<style scoped>
.terminal-empty-state {
  display: grid;
  min-height: 0;
  flex: 1;
  place-items: center;
  padding: 2rem;
  background:
    linear-gradient(color-mix(in srgb, var(--border-subtle) 28%, transparent) 1px, transparent 1px),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--border-subtle) 28%, transparent) 1px,
      transparent 1px
    );
  background-size: 32px 32px;
}
.terminal-empty-card {
  width: min(560px, 100%);
  padding: 2.25rem;
  border: 1px solid var(--border-normal);
  background: color-mix(in srgb, var(--surface-base) 96%, transparent);
  text-align: center;
  box-shadow: 0 18px 55px color-mix(in srgb, #000 28%, transparent);
}
.terminal-empty-icon {
  display: grid;
  width: 48px;
  height: 48px;
  margin: 0 auto 1rem;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--accent-color) 55%, var(--border-normal));
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  color: var(--accent-color);
}
h1 {
  margin: 0;
  color: var(--fg-strong);
  font-size: 18px;
  font-weight: 500;
}
p {
  max-width: 440px;
  margin: 0.75rem auto 1.25rem;
  color: var(--fg-muted);
  font-size: 12px;
  line-height: 1.65;
}
.terminal-empty-route {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  margin: 0 auto 1.35rem;
  padding: 0.75rem;
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-muted) 45%, transparent);
  color: var(--fg-muted);
  font-size: 10px;
}
.terminal-empty-route span {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.terminal-empty-route i {
  color: var(--fg-disabled);
  font-style: normal;
}
.terminal-empty-action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 34px;
  padding-inline: 1rem;
}
small {
  display: block;
  margin-top: 0.8rem;
  color: var(--fg-disabled);
  font-size: 10px;
}
@media (max-width: 620px) {
  .terminal-empty-state {
    padding: 1rem;
  }
  .terminal-empty-card {
    padding: 1.5rem 1rem;
  }
  .terminal-empty-route {
    align-items: stretch;
    flex-direction: column;
  }
  .terminal-empty-route i {
    transform: rotate(90deg);
  }
}
</style>
