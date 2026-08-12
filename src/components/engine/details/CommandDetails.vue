<script setup lang="ts">
import { computed } from 'vue'

import type { CommandProjection } from '@/lib/gateway'
import DetailGrid from './DetailGrid.vue'
import { compactDetails, detail, formatTimestamp, optionalDetail } from './model'

const props = defineProps<{ command: CommandProjection }>()

const rows = computed(() =>
  compactDetails([
    detail('Command', props.command.accepted.kind),
    detail('Lifecycle', props.command.lifecycle),
    detail('Accepted', formatTimestamp(props.command.accepted_at)),
    detail('Operations', props.command.operation_ids.length),
    optionalDetail('Failure', props.command.failure_reason),
  ]),
)
</script>

<template>
  <div data-testid="command-details">
    <DetailGrid title="Command" :rows="rows" />
  </div>
</template>
