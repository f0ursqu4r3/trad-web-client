<script setup lang="ts">
import { computed } from 'vue'
import { formatMarketRef } from '@/lib/marketContext'
import { formatName } from '@/lib/utils'
import type { CommandEffectRecord, CommandHistoryItem, Uuid } from '@/lib/ws/protocol'

const props = defineProps<{
  command: CommandHistoryItem
  effects: CommandEffectRecord[]
}>()

const emit = defineEmits<{
  (event: 'inspect-command', commandId: Uuid): void
  (event: 'inspect-device', deviceId: Uuid): void
}>()

const isAccountFlatten = computed(() => props.command.command.kind === 'FlattenHyperliquidAccount')

const symbol = computed(() => {
  if (props.command.command.kind !== 'FlattenHyperliquidSymbol') return null
  return props.command.command.data.symbol
})

const scopeLabel = computed(() =>
  isAccountFlatten.value ? 'Entire Hyperliquid account' : `Symbol ${symbol.value ?? '-'}`,
)

const marketLabel = computed(() => formatMarketRef(props.command.market_ref))

const affectedCommands = computed(() => {
  const grouped = new Map<Uuid, CommandEffectRecord[]>()
  props.effects.forEach((effect) => {
    const records = grouped.get(effect.affected_command_id) ?? []
    records.push(effect)
    grouped.set(effect.affected_command_id, records)
  })
  return Array.from(grouped.entries()).map(([commandId, effects]) => ({
    commandId,
    symbol: effects[0]?.symbol ?? '-',
    effects,
  }))
})

const closeOrderIds = computed(() =>
  Array.from(
    new Set(
      props.effects.flatMap((effect) =>
        effect.close_order_device_id ? [effect.close_order_device_id] : [],
      ),
    ),
  ),
)

function effectLabels(effects: CommandEffectRecord[]): string {
  return Array.from(new Set(effects.map((effect) => formatName(effect.effect)))).join(', ')
}

function formatCreatedAt(value: string): string {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function copyCommandId(): void {
  void navigator.clipboard?.writeText(props.command.command_id)
}
</script>

<template>
  <div class="flatten-details">
    <header class="flatten-header">
      <div>
        <div class="flatten-eyebrow">Hyperliquid operation</div>
        <h3>{{ isAccountFlatten ? 'Flatten All' : 'Flatten Position' }}</h3>
      </div>
      <span class="flatten-status">{{ command.status }}</span>
    </header>

    <div class="flatten-identifiers">
      <button type="button" title="Copy command ID" @click="copyCommandId">
        Command ID: <span>{{ command.command_id }}</span>
      </button>
      <span>Created: {{ formatCreatedAt(command.created_at) }}</span>
    </div>

    <div class="flatten-facts">
      <div>
        <span>Scope</span>
        <strong>{{ scopeLabel }}</strong>
      </div>
      <div v-if="marketLabel">
        <span>Market</span>
        <strong>{{ marketLabel }}</strong>
      </div>
      <div>
        <span>Affected commands</span>
        <strong>{{ affectedCommands.length }}</strong>
      </div>
      <div>
        <span>Close orders</span>
        <strong>{{ closeOrderIds.length }}</strong>
      </div>
    </div>

    <section class="flatten-section">
      <h4>Result</h4>
      <p>{{ command.result || 'The server accepted the flatten operation.' }}</p>
    </section>

    <section class="flatten-section">
      <h4>Affected commands</h4>
      <div v-if="affectedCommands.length" class="flatten-links">
        <button
          v-for="affected in affectedCommands"
          :key="affected.commandId"
          type="button"
          @click="emit('inspect-command', affected.commandId)"
        >
          <span>{{ affected.symbol }}</span>
          <span>#{{ affected.commandId.slice(0, 8) }}</span>
          <span>{{ effectLabels(affected.effects) }}</span>
        </button>
      </div>
      <p v-else>
        No command-owned exposure was linked to this operation. This is expected when the
        authoritative exchange account was already flat. Older flatten operations created before
        effect tracking may also have no links.
      </p>
    </section>

    <section v-if="closeOrderIds.length" class="flatten-section">
      <h4>Reduce-only close orders</h4>
      <div class="flatten-links">
        <button
          v-for="deviceId in closeOrderIds"
          :key="deviceId"
          type="button"
          @click="emit('inspect-device', deviceId)"
        >
          <span>Order</span>
          <span>#{{ deviceId.slice(0, 8) }}</span>
          <span>Inspect device</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.flatten-details {
  background: color-mix(in srgb, var(--color-info) 5%, transparent);
  height: 100%;
  overflow: auto;
}
.flatten-header,
.flatten-identifiers,
.flatten-facts,
.flatten-section {
  border-bottom: 1px solid var(--border-color);
  padding: 10px 12px;
}
.flatten-header,
.flatten-identifiers {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}
.flatten-eyebrow,
.flatten-facts span,
.flatten-section h4 {
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
}
.flatten-header h3 {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  margin: 2px 0 0;
}
.flatten-status {
  border: 1px solid var(--color-info);
  color: var(--color-info);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 5px;
  text-transform: uppercase;
}
.flatten-identifiers {
  color: var(--color-text-dim);
  flex-wrap: wrap;
  font-family: var(--font-mono);
  font-size: 11px;
}
.flatten-identifiers button {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
.flatten-identifiers button:hover span {
  color: var(--color-info);
}
.flatten-identifiers span {
  color: var(--color-text);
}
.flatten-facts {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}
.flatten-facts div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.flatten-facts strong {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
}
.flatten-section h4 {
  margin: 0 0 6px;
}
.flatten-section p {
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  margin: 0;
  white-space: pre-wrap;
}
.flatten-links {
  display: flex;
  flex-direction: column;
}
.flatten-links button {
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-dim);
  display: grid;
  font-family: var(--font-mono);
  font-size: 11px;
  gap: 8px;
  grid-template-columns: minmax(52px, auto) minmax(76px, auto) 1fr;
  padding: 4px;
  text-align: left;
}
.flatten-links button:hover {
  border-color: var(--color-info);
  color: var(--color-info);
}
</style>
