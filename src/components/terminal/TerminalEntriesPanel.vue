<script setup lang="ts">
// Placeholder trailing entries (devices)
import { reactive } from 'vue'

interface Entry { id: string; direction: 'LONG' | 'SHORT'; activationPrice: number; status: 'Triggered' | 'Armed'; entryPrice?: number }
const entries = reactive<Entry[]>([
  { id: 'f3152000', direction: 'LONG', activationPrice: 600.25, status: 'Triggered', entryPrice: 599.7 },
  { id: '540a0396', direction: 'LONG', activationPrice: 600.7, status: 'Armed' },
])
</script>

<template>
  <section class="panel entries-panel">
    <header class="panel-header">Entries</header>
    <table class="entries-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Dir</th>
          <th>Activation</th>
          <th>Status</th>
          <th>Entry</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in entries" :key="e.id">
          <td>{{ e.id }}</td>
          <td>{{ e.direction }}</td>
          <td>{{ e.activationPrice.toFixed(2) }}</td>
          <td>{{ e.status }}</td>
          <td>{{ e.entryPrice?.toFixed(2) || '-' }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.entries-panel { display: flex; flex-direction: column; }
.entries-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 11px; }
.entries-table th, .entries-table td { padding: 2px 4px; border-bottom: 1px solid var(--border-color); }
.entries-table thead { background: var(--panel-header-bg); }
</style>
