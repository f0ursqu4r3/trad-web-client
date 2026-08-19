<script setup lang="ts">
import type { AccountKeyValidationResponse } from '@/stores/accounts'
import GuidedAction from '@/components/forms/GuidedAction.vue'

defineProps<{
  copy: string
  success: string
  result: AccountKeyValidationResponse | null
  error: string | null
  prompt: string | null
  checking: boolean
  canCheck: boolean
  isHyperliquid: boolean
}>()
defineEmits<{ check: [] }>()
</script>

<template>
  <section
    class="validation-panel"
    :class="{
      'validation-panel-valid': result?.valid,
      'validation-panel-invalid': (result && !result.valid) || error,
      'validation-panel-required': !result?.valid,
    }"
  >
    <div class="validation-header">
      <div>
        <div class="validation-heading">
          <div class="validation-title">Required permission check</div>
          <span class="pill pill-xs" :class="result?.valid ? 'pill-ok' : 'pill-warn'">
            {{ result?.valid ? 'complete' : 'required' }}
          </span>
        </div>
        <div class="validation-copy">{{ copy }}</div>
      </div>
      <GuidedAction :active="canCheck && !checking && !result?.valid" label="Click this next">
        <button
          type="button"
          class="btn"
          :class="result?.valid ? 'btn-secondary' : 'btn-primary'"
          :disabled="checking || !canCheck"
          @click="$emit('check')"
        >
          <span v-if="checking">Checking...</span>
          <span v-else-if="result?.valid">Recheck permissions</span>
          <span v-else>Check permissions</span>
        </button>
      </GuidedAction>
    </div>
    <div v-if="result?.valid" class="validation-success">{{ success }}</div>
    <div v-else-if="prompt" class="validation-prompt">{{ prompt }}</div>
    <div v-if="error" class="validation-error">{{ error }}</div>
    <div v-if="result" class="validation-details">
      <div v-if="result.missing_requirements.length">
        <div class="validation-section-title">Missing</div>
        <ul>
          <li v-for="item in result.missing_requirements" :key="item">{{ item }}</li>
        </ul>
      </div>
      <div v-if="result.warnings.length">
        <div class="validation-section-title">
          {{ isHyperliquid ? 'Next setup step' : 'Change on Bybit' }}
        </div>
        <ul>
          <li v-for="item in result.warnings" :key="item">{{ item }}</li>
        </ul>
      </div>
      <div v-if="result.present_permissions.length">
        <div class="validation-section-title">Detected</div>
        <div class="permission-chip-row">
          <span v-for="item in result.present_permissions" :key="item" class="permission-chip">
            {{ item }}
          </span>
        </div>
      </div>
      <div v-if="result.exchange_message" class="validation-copy">
        {{ isHyperliquid ? 'Hyperliquid' : 'Bybit' }}: {{ result.exchange_message }}
      </div>
    </div>
  </section>
</template>

<style scoped>
.validation-panel {
  grid-column: span 2 / span 2;
  padding: 0.65rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-panel);
  background: color-mix(in srgb, var(--panel-header-bg) 50%, transparent);
}
.validation-panel-valid {
  border-color: color-mix(in srgb, #22c55e 60%, var(--border-color));
}
.validation-panel-required {
  border-color: color-mix(in srgb, var(--state-warning) 65%, var(--border-color));
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--state-warning) 55%, transparent);
}
.validation-panel-invalid {
  border-color: color-mix(in srgb, #f87171 70%, var(--border-color));
}
.validation-header,
.validation-heading {
  display: flex;
  gap: 0.65rem;
}
.validation-header {
  align-items: flex-start;
  justify-content: space-between;
}
.validation-header .btn {
  flex: 0 0 auto;
  white-space: nowrap;
}
.validation-header :deep(.guided-action) {
  flex: 0 0 auto;
}
.validation-heading {
  align-items: center;
  gap: 0.45rem;
}
.validation-title,
.validation-section-title {
  color: var(--color-text-dim);
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.validation-copy {
  margin-top: 0.2rem;
  color: var(--color-text-dim);
  font-size: 11px;
  line-height: 1.35;
}
.validation-success,
.validation-error,
.validation-prompt {
  margin-top: 0.5rem;
  font-size: 11px;
}
.validation-success {
  color: #86efac;
}
.validation-prompt {
  color: var(--state-warning);
}
.validation-error {
  color: #fca5a5;
}
.validation-details {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.55rem;
  color: var(--color-text);
  font-size: 11px;
}
.validation-details ul {
  margin: 0.25rem 0 0;
  padding-left: 1rem;
}
.permission-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.3rem;
}
.permission-chip {
  padding: 0.15rem 0.35rem;
  overflow-wrap: anywhere;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-input);
  background: color-mix(in srgb, var(--panel-header-bg) 70%, transparent);
  color: var(--color-text);
}
@media (max-width: 560px) {
  .validation-panel {
    grid-column: 1 / -1;
  }
  .validation-header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
