<template>
  <section class="orders-column">
    <DockviewVue :theme="currentTheme" @ready="onReady" />
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { DockviewVue, type DockviewReadyEvent, themeDark, themeLight } from 'dockview-vue'

import { useUiStore } from '@/stores/ui'

type DockviewApi = DockviewReadyEvent['api']
const apiRef = ref<DockviewApi | null>(null)

const ui = useUiStore()

const currentTheme = computed(() => (ui.theme === 'dark' ? themeDark : themeLight))

function onReady(event: DockviewReadyEvent) {
  apiRef.value = event.api
  // You can use the api to add/remove/move components
  // api.addComponent('my-component', { title: 'My Component' });
}
</script>
