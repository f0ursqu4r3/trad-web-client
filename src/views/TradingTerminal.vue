<script setup lang="ts">
import TerminalLogPanel from '@/components/terminal/TerminalLogPanel.vue'
import TerminalChartPanel from '@/components/terminal/TerminalChartPanel.vue'
import TerminalOrderTree from '@/components/terminal/TerminalOrderTree.vue'
import TerminalEntriesPanel from '@/components/terminal/TerminalEntriesPanel.vue'
import TerminalCommandInput from '@/components/terminal/TerminalCommandInput.vue'
import TerminalDeviceDetails from '@/components/terminal/TerminalDeviceDetails.vue'
</script>

<template>
  <div class="terminal-layout">
    <TerminalLogPanel class="area-log" />
    <TerminalChartPanel class="area-chart" />
    <TerminalOrderTree class="area-tree" />
    <TerminalEntriesPanel class="area-entries" />
    <TerminalDeviceDetails class="area-details" />
    <TerminalCommandInput class="area-command" />
  </div>
</template>

<style scoped>
.terminal-layout {
  height: 100%;
  display: grid;
  gap: 6px;
  padding: 6px;
  box-sizing: border-box;
  grid-template-columns: 320px 1fr 320px; /* left sidebar, main, right sidebar */
  grid-template-rows: 260px 1fr 180px 48px; /* top log, middle, entries, cmd */
  grid-template-areas:
    'log chart details'
    'log chart details'
    'tree chart details'
    'command command command';
}
.area-log {
  grid-area: log;
}
.area-chart {
  grid-area: chart;
}
.area-tree {
  grid-area: tree;
}
.area-entries {
  grid-area: entries;
}
.area-details {
  grid-area: details;
}
.area-command {
  grid-area: command;
}

.panel {
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 0 0 1px var(--panel-border-inner);
  display: flex;
  flex-direction: column;
}
.panel-header {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 6px;
  background: var(--panel-header-bg);
  border-bottom: 1px solid var(--border-color);
  font-family: var(--font-mono);
}
</style>
