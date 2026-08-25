<script setup lang="ts">
import { formatExactDecimal } from '@/lib/exactDecimalMath'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'

defineProps<{ trade: ManagedTradeView }>()
</script>

<template>
  <div class="orders-content">
    <section>
      <h3>Orders</h3>
      <table v-if="trade.orders.length" class="table-tiny table-compact">
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Type</th>
            <th>Filled</th>
            <th>Remaining</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in trade.orders" :key="order.order_id">
            <td>{{ order.current_request.reduce_only ? 'Close' : 'Entry' }}</td>
            <td>{{ String(order.current_request.execution.kind).replace(/_/g, ' ') }}</td>
            <td>{{ formatExactDecimal(order.filled_quantity) }}</td>
            <td>{{ formatExactDecimal(order.remaining_quantity) }}</td>
            <td>{{ order.lifecycle }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-copy">No physical order has been created yet.</p>
    </section>
    <section>
      <h3>Protection</h3>
      <table v-if="trade.protection" class="table-tiny table-compact">
        <thead>
          <tr>
            <th>Role</th>
            <th>Trigger</th>
            <th>Execution</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="child in trade.protection.plan.children" :key="child.child_id">
            <td>{{ child.protection_kind.replace(/_/g, ' ') }}</td>
            <td>{{ formatExactDecimal(child.trigger_price) }}</td>
            <td>{{ child.execution.kind.replace(/_/g, ' ') }}</td>
            <td>
              {{
                formatExactDecimal(
                  trade.protection.children[child.child_id]?.target_quantity ?? '0',
                )
              }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-copy">No native protection is attached.</p>
    </section>
  </div>
</template>

<style scoped>
.orders-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border-subtle);
}
.orders-content section {
  padding: 0.75rem;
  background: var(--surface-base);
}
.orders-content h3 {
  margin: 0 0 0.6rem;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}
.empty-copy {
  margin: 0;
  padding: 1rem;
  color: var(--fg-muted);
}
@media (max-width: 760px) {
  .orders-content {
    grid-template-columns: 1fr;
  }
}
</style>
