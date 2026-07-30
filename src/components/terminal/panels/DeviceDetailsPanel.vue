<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '@/stores/devices'
import TrailingEntryDevice from '@/components/terminal/devices/TrailingEntryDevice.vue'
import OrderDevice from '@/components/terminal/devices/OrderDevice.vue'
import ChaseDevice from '@/components/terminal/devices/ChaseDevice.vue'
import StopGuardDevice from '@/components/terminal/devices/StopGuardDevice.vue'
import NativeProtectionDevice from '@/components/terminal/devices/NativeProtectionDevice.vue'
import SplitDevice from '@/components/terminal/devices/SplitDevice.vue'
import FlattenCommandDetails from '@/components/terminal/commands/FlattenCommandDetails.vue'
import { useCommandStore } from '@/stores/command'
import { formatMarketRef } from '@/lib/marketContext'
import { protectionDisplay } from '@/lib/protectionState'
import { useWsStore } from '@/stores/ws'
import {
  TrailingEntryLifecycle,
  TrailingEntryPhase,
  type TrailingEntrySnapshot,
} from '@/lib/ws/protocol'
import type { TrailingEntryState } from '@/stores/devices'
import EditTrailingEntryModal from '@/components/terminal/modals/EditTrailingEntryModal.vue'
import ActionConfirmationModal from '@/components/terminal/modals/ActionConfirmationModal.vue'

const deviceStore = useDeviceStore()
const commandStore = useCommandStore()
const wsStore = useWsStore()
const { selectedDevice } = storeToRefs(deviceStore)
const { selectedCommand } = storeToRefs(commandStore)
const editTeOpen = ref(false)
const enterNowConfirmation = ref(false)

const selectedTe = computed(() => {
  if (selectedDevice.value?.kind !== 'TrailingEntry') return null
  return selectedDevice.value.state as TrailingEntryState
})
const teEditable = computed(
  () =>
    selectedTe.value?.lifecycle === TrailingEntryLifecycle.Running &&
    !selectedTe.value.completed &&
    !selectedTe.value.cancelled,
)
const canActivateNow = computed(
  () => teEditable.value && selectedTe.value?.phase === TrailingEntryPhase.Initial,
)

function immediateTeData() {
  const te = selectedTe.value
  const deviceId = selectedDevice.value?.id
  if (!te || !deviceId) return null
  return {
    device_id: deviceId,
    expected_revision: te.state_revision,
    expected_phase: te.phase,
    expected_lifecycle: te.lifecycle,
  }
}

function activateNow() {
  const data = immediateTeData()
  if (!data) return
  wsStore.sendUserCommand({ kind: 'ActivateTrailingEntryNow', data })
}

function enterNow() {
  const data = immediateTeData()
  enterNowConfirmation.value = false
  if (!data) return
  wsStore.sendUserCommand({ kind: 'EnterTrailingEntryNow', data })
}

const selectedFlattenCommand = computed(() => {
  const command = selectedCommand.value
  if (
    command?.command.kind !== 'FlattenHyperliquidAccount' &&
    command?.command.kind !== 'FlattenHyperliquidSymbol'
  ) {
    return null
  }
  return command
})

const selectedFlattenEffects = computed(() => {
  const command = selectedFlattenCommand.value
  return command ? commandStore.flattenEffectsFrom(command.command_id) : []
})

function fmtDate(d?: Date | null): string {
  if (!d) return '-'
  try {
    return new Date(d).toLocaleString()
  } catch {
    return '-'
  }
}

const deviceComp = computed(() => {
  if (!selectedDevice.value) return null
  switch (selectedDevice.value.kind) {
    case 'TrailingEntry':
      return TrailingEntryDevice
    case 'Order':
      return OrderDevice
    case 'Chase':
      return ChaseDevice
    case 'StopGuard':
      return StopGuardDevice
    case 'NativeProtection':
      return NativeProtectionDevice
    case 'Split':
      return SplitDevice
    default:
      return null
  }
})

const deviceStatusClass = computed(() => {
  const device = selectedDevice.value
  if (!device) return ''
  if (device.failed) return 'device-details-failed'
  if (device.canceled) return 'device-details-canceled'
  if (device.complete) return 'device-details-complete'
  if (device.awaiting_children) return 'device-details-waiting'
  return 'device-details-active'
})

const orderCreatedAt = computed(() => {
  const device = selectedDevice.value
  if (!device || device.kind !== 'Order') return null
  return device.created_at
})

const marketRefLabel = computed(() => {
  return formatMarketRef(selectedDevice.value?.market_ref)
})

const protectionSummary = computed(() => {
  return protectionDisplay(selectedDevice.value?.protection_state)
})

function copyDeviceId(): void {
  const id = selectedDevice.value?.id
  if (!id) return
  void navigator.clipboard?.writeText(id)
}
</script>

<template>
  <section class="relative flex flex-col min-h-0 w-full h-full">
    <div
      v-if="selectedDevice"
      class="w-full h-full overflow-auto device-details"
      :class="deviceStatusClass"
    >
      <div
        class="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]"
      >
        <button
          class="font-mono text-[11px] dim hover:text-white"
          type="button"
          @click="copyDeviceId"
        >
          Device ID:
          <span class="text-primary">{{ selectedDevice.id }}</span>
        </button>
        <div class="text-[11px] dim">
          Created:
          <span class="font-mono text-primary">{{ fmtDate(selectedDevice.created_at) }}</span>
        </div>
      </div>
      <div
        v-if="marketRefLabel || protectionSummary"
        class="flex flex-wrap gap-2 px-3 py-2 border-b border-[var(--border-color)]"
      >
        <span v-if="marketRefLabel" class="pill pill-xs">{{ marketRefLabel }}</span>
        <span v-if="protectionSummary" class="pill pill-xs" :class="protectionSummary.className">
          {{ protectionSummary.text }}
        </span>
      </div>
      <div
        v-if="selectedTe && teEditable"
        class="flex flex-wrap items-center gap-2 border-b border-[var(--border-color)] px-3 py-2"
      >
        <button v-if="canActivateNow" class="btn btn-sm" type="button" @click="activateNow">
          Activate Now
        </button>
        <button class="btn btn-sm" type="button" @click="enterNowConfirmation = true">
          Enter Now
        </button>
        <button class="btn btn-sm btn-ghost" type="button" @click="editTeOpen = true">
          Edit TE
        </button>
      </div>
      <component
        v-if="deviceComp"
        :is="deviceComp"
        :device="selectedDevice.state as any"
        :market-ref="selectedDevice.market_ref"
        :protection-state="selectedDevice.protection_state"
        :command-id="selectedDevice.associated_command_id"
        :failure-reason="selectedDevice.failure_reason"
        :failed="selectedDevice.failed"
        :canceled="selectedDevice.canceled"
        :complete="selectedDevice.complete"
        :device-id="selectedDevice.id"
        :created-at="orderCreatedAt"
        class="w-full h-full"
      />
    </div>
    <div v-else class="h-full min-h-0">
      <FlattenCommandDetails
        v-if="selectedFlattenCommand"
        :command="selectedFlattenCommand"
        :effects="selectedFlattenEffects"
        @inspect-command="commandStore.inspectCommand"
        @inspect-device="deviceStore.inspectDevice"
      />
      <div
        v-else
        class="flex items-center justify-center h-full text-[var(--color-text-dim)] text-sm"
      >
        No device selected
      </div>
    </div>
    <EditTrailingEntryModal
      v-if="selectedTe && selectedDevice"
      :open="editTeOpen"
      :device-id="selectedDevice.id"
      :device="selectedTe as unknown as TrailingEntrySnapshot"
      @close="editTeOpen = false"
    />
    <ActionConfirmationModal
      v-if="enterNowConfirmation"
      :open="true"
      title="Enter Now"
      message="Bypass the remaining trailing wait and submit this TE's entry through the normal order and protection pipeline at the latest authoritative stream price?"
      confirm-label="Enter Now"
      @cancel="enterNowConfirmation = false"
      @confirm="enterNow"
    />
  </section>
</template>

<style scoped>
.device-details-failed {
  background-color: color-mix(in srgb, var(--color-error) 10%, transparent);
}
.device-details-canceled {
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
}
.device-details-complete {
  background-color: color-mix(in srgb, var(--color-success) 8%, transparent);
}
.device-details-waiting {
  background-color: color-mix(in srgb, var(--color-info) 8%, transparent);
}
.device-details-active {
  background-color: color-mix(in srgb, var(--color-warning) 8%, transparent);
}
</style>
