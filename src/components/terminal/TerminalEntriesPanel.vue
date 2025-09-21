<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useTerminalStore } from '@/stores/terminal'
import TinyTable from '@/components/general/TinyTable.vue'

const terminal = useTerminalStore()
const { devices, selectedDeviceId } = storeToRefs(terminal)

function pick(id: string) {
  console.log('pick', id)
  terminal.selectDevice(id)
}

function onSelectedDevice(key: string | number | null) {
  if (typeof key === 'string' && key) {
    pick(key)
  }
}
</script>

<template>
  <section class="entries-panel">
    <tiny-table
      :columns="[
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'type', label: 'Type' },
        { key: 'direction', label: 'Direction' },
        { key: 'entryPrice', label: 'Entry Price' },
        { key: 'activationPrice', label: 'Activation Price' },
        { key: 'status', label: 'Status' },
      ]"
      :rows="devices || []"
      row-key="id"
      selectable
      selection-mode="single"
      :selected-key="selectedDeviceId"
      @update:selectedKey="onSelectedDevice"
      dense
      striped
      hover
    >
    </tiny-table>
  </section>
</template>

<style scoped>
.entries-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
