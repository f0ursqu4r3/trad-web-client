<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ProfileSettings from './ProfileSettings.vue'
import TradingAccountsSettings from './TradingAccountsSettings.vue'
import PreferencesSettings from './PreferencesSettings.vue'
import BillingSettings from './BillingSettings.vue'

const route = useRoute()
const pages = {
  profile: ProfileSettings,
  accounts: TradingAccountsSettings,
  preferences: PreferencesSettings,
  billing: BillingSettings,
}
const page = computed(
  () => pages[String(route.params.section) as keyof typeof pages] || ProfileSettings,
)
</script>

<template><component :is="page" /></template>
