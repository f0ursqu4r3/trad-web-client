<script setup lang="ts">
import { computed, type Component } from 'vue'
import { Activity, Orbit, Shield, UserRound, Zap } from 'lucide-vue-next'
import type { ProfileIconKey } from '@/lib/profileIcons'

const props = defineProps<{ icon: ProfileIconKey; initial: string; size?: number }>()

const components: Partial<Record<ProfileIconKey, Component>> = {
  user: UserRound,
  bolt: Zap,
  activity: Activity,
  orbit: Orbit,
  shield: Shield,
}

const component = computed(() => components[props.icon])
</script>

<template>
  <component :is="component" v-if="component" :size="size || 18" aria-hidden="true" />
  <span v-else aria-hidden="true">{{ initial }}</span>
</template>
