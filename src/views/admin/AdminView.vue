<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import OperationsAdmin from './OperationsAdmin.vue'
import UsersAdmin from './UsersAdmin.vue'
import AccountsAdmin from './AccountsAdmin.vue'
import ExecutionAdmin from './ExecutionAdmin.vue'
import AuditAdmin from './AuditAdmin.vue'

const route = useRoute()
const pages = {
  operations: OperationsAdmin,
  users: UsersAdmin,
  accounts: AccountsAdmin,
  execution: ExecutionAdmin,
  audit: AuditAdmin,
}
const page = computed(
  () => pages[String(route.params.section) as keyof typeof pages] || OperationsAdmin,
)
</script>
<template><component :is="page" /></template>
