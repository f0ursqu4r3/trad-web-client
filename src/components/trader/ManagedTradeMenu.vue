<script setup lang="ts">
import { computed, ref } from 'vue'
import { Menu } from 'lucide-vue-next'

import DropMenu, { type DropMenuItem } from '@/components/general/DropMenu.vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { duplicateCommandPrefill, type EngineCommandPrefill } from '@/lib/engineCommands/prefill'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'
import { useAccountsStore } from '@/stores/accounts'
import { useProjectionUiStore } from '@/stores/projectionUi'

export type ManagedTradeDetailTab = 'orders' | 'chart' | 'devices' | 'sequence' | 'history'

const props = defineProps<{
  trade: ManagedTradeView
  chartAvailable: boolean
  miniChart: boolean
}>()
const emit = defineEmits<{
  (event: 'detail', tab: ManagedTradeDetailTab): void
  (event: 'toggle-mini-chart'): void
  (event: 'duplicate', prefill: EngineCommandPrefill): void
}>()

const accounts = useAccountsStore()
const ui = useProjectionUiStore()
const menu = ref<InstanceType<typeof DropMenu> | null>(null)
const renameOpen = ref(false)
const renameValue = ref('')
const renameColor = ref<string | null>(null)
const formId = `managed-trade-rename-${props.trade.primaryCommand.command_id}`
const colors = [
  { label: 'Default', value: null },
  { label: 'Blue', value: '#5cc8ff' },
  { label: 'Green', value: '#6ee7b7' },
  { label: 'Yellow', value: '#fbbf24' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Red', value: '#f87171' },
  { label: 'Purple', value: '#a78bfa' },
  { label: 'Pink', value: '#f472b6' },
]

const items = computed<DropMenuItem[]>(() => {
  const command = props.trade.primaryCommand
  const meta = ui.meta(command.command_id)
  const duplicate =
    accounts.selectedAccountId === null
      ? null
      : duplicateCommandPrefill(command, accounts.selectedAccountId)
  return [
    ...(duplicate === null
      ? []
      : [
          {
            label: 'Duplicate trade',
            action: () => emit('duplicate', duplicate),
          },
        ]),
    {
      label: meta.pinned ? 'Unpin trade' : 'Pin trade',
      action: () => ui.togglePinned(command.command_id),
    },
    { label: 'Nickname / color…', action: openRename },
    ...(props.chartAvailable
      ? [
          {
            label: props.miniChart ? 'Hide mini chart' : 'Show mini chart',
            action: () => emit('toggle-mini-chart'),
          },
          { label: 'Open chart', action: () => emit('detail', 'chart') },
        ]
      : []),
    { label: 'Open devices', action: () => emit('detail', 'devices') },
    { label: 'Open sequence', action: () => emit('detail', 'sequence') },
    { label: 'Open history', action: () => emit('detail', 'history') },
  ]
})

function openAt(x: number, y: number): void {
  void menu.value?.openAt(x, y)
}

function openRename(): void {
  const meta = ui.meta(props.trade.primaryCommand.command_id)
  renameValue.value = meta.nickname ?? ''
  renameColor.value = meta.nicknameColor
  renameOpen.value = true
}

function saveRename(): void {
  ui.setNickname(props.trade.primaryCommand.command_id, renameValue.value, renameColor.value)
  renameOpen.value = false
}

function clearRename(): void {
  renameValue.value = ''
  renameColor.value = null
  saveRename()
}

defineExpose({ openAt })
</script>

<template>
  <DropMenu ref="menu" :items="items">
    <template #trigger="{ toggle, open }">
      <button
        class="btn btn-xs icon-btn trade-menu-trigger"
        type="button"
        title="Trade actions"
        aria-label="Trade actions"
        aria-haspopup="menu"
        :aria-expanded="open ? 'true' : 'false'"
        @click.stop="toggle"
      >
        <Menu :size="13" />
      </button>
    </template>
  </DropMenu>

  <BaseCommandModal title="Trade nickname" :open="renameOpen" @close="renameOpen = false">
    <form :id="formId" class="rename-form" @submit.prevent="saveRename">
      <label class="rename-field">
        <span>Nickname</span>
        <input v-model="renameValue" class="input" maxlength="80" autocomplete="off" />
      </label>
      <fieldset class="color-field">
        <legend>Color</legend>
        <button
          v-for="color in colors"
          :key="color.label"
          class="color-option"
          :class="{ selected: renameColor === color.value }"
          type="button"
          :title="color.label"
          :aria-label="color.label"
          @click="renameColor = color.value"
        >
          <span :style="{ background: color.value ?? 'var(--fg-muted)' }" />
        </button>
      </fieldset>
    </form>
    <template #footer>
      <button class="btn btn-ghost" type="button" @click="clearRename">Remove</button>
      <button class="btn btn-ghost" type="button" @click="renameOpen = false">Cancel</button>
      <button class="btn" type="submit" :form="formId">Save</button>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.trade-menu-trigger {
  width: 26px;
  height: 26px;
}
.rename-form {
  display: grid;
  gap: 1rem;
}
.rename-field {
  display: grid;
  gap: 0.4rem;
}
.color-field {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  border: 0;
}
.color-field legend {
  width: 100%;
  margin-bottom: 0.35rem;
}
.color-option {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--border-normal);
}
.color-option.selected {
  border-color: var(--fg-strong);
}
.color-option span {
  width: 14px;
  height: 14px;
}
</style>
