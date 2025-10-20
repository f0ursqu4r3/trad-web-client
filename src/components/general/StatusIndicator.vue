<script setup lang="ts">
// a simple status indicator dot component
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    title?: string
    status: string | null
    animated?: boolean
  }>(),
  {
    status: 'success',
    animated: false,
  },
)

const statusClass = computed(() => {
  let status = 'neutral'
  switch (props.status) {
    case 'ok':
    case 'success':
      status = 'success'
      break
    case 'err':
    case 'error':
      status = 'error'
      break
    case 'warn':
    case 'warning':
      status = 'warning'
      break
    case 'info':
      status = 'info'
      break
    default:
      status = 'neutral'
  }
  return `status-indicator-${status}`
})
</script>

<template>
  <span
    :title="props.title"
    class="status-indicator"
    :class="[statusClass, { 'animate-pulse': props.animated }]"
    aria-hidden="true"
  ></span>
</template>
