<script setup lang="ts">
import { reactive } from 'vue'

import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'
import { useAdminStore, type TelemetryTimelineFilters } from '@/stores/admin'

const admin = useAdminStore()
const filters = reactive<TelemetryTimelineFilters>({})

function search(): void {
  void admin.fetchTelemetryTimeline(filters)
}

function clear(): void {
  for (const key of Object.keys(filters) as Array<keyof TelemetryTimelineFilters>) {
    delete filters[key]
  }
  admin.telemetryTimeline = []
}

function evidenceLane(eventName: string): string {
  if (
    eventName === 'websocket_state_changed' ||
    eventName.startsWith('request_') ||
    eventName === 'response_received' ||
    eventName === 'owner_redirect_observed' ||
    eventName === 'resnapshot_requested'
  ) {
    return 'browser transport observation'
  }
  if (
    eventName.startsWith('command_') ||
    eventName === 'durable_command_linked' ||
    eventName === 'venue_rejection_observed' ||
    eventName === 'action_outcome_observed'
  ) {
    return 'browser-observed durable correlation'
  }
  return 'browser interaction'
}
</script>

<template>
  <ControlPageHeader
    eyebrow="Administration"
    title="Session timelines"
    description="Untrusted browser observations correlated with Gateway request and durable command identities. Engine and exchange records remain financial authority."
  />
  <ControlSection
    title="Lookup"
    description="Every lookup is written to the telemetry access audit."
  >
    <form class="timeline-filters" @submit.prevent="search">
      <label
        v-for="field in [
          'user_id',
          'account_id',
          'trade_id',
          'session_id',
          'action_attempt_id',
          'request_id',
          'command_id',
          'event_name',
        ]"
        :key="field"
      >
        <span>{{ field }}</span>
        <input
          v-model="filters[field as keyof TelemetryTimelineFilters]"
          class="input input-sm"
          :placeholder="field"
        />
      </label>
      <div class="timeline-actions">
        <button class="btn btn-primary btn-sm" type="submit" :disabled="admin.loading">
          Search
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="clear">Clear</button>
      </div>
    </form>
  </ControlSection>
  <ControlSection
    title="Chronological evidence"
    :description="`${admin.telemetryTimeline.length} events · receipt time oldest first`"
  >
    <div class="timeline-list">
      <article
        v-for="event in admin.telemetryTimeline"
        :key="event.event_id"
        class="timeline-event"
        :class="{ late: event.late || event.sequence_gap > 0 }"
      >
        <div class="timeline-event-head">
          <strong>{{ event.event_name }}</strong>
          <span class="timeline-lane">{{ evidenceLane(event.event_name) }}</span>
          <time>{{ new Date(event.received_at).toLocaleString() }}</time>
          <span>session #{{ event.session_sequence }}</span>
          <span>{{ event.connection_state }}</span>
        </div>
        <div class="timeline-identities">
          <code>user {{ event.user_id }}</code>
          <code v-if="event.account_id">account {{ event.account_id }}</code>
          <code v-if="event.trade_id">trade {{ event.trade_id }}</code>
          <code v-if="event.action_attempt_id">attempt {{ event.action_attempt_id }}</code>
          <code v-if="event.request_id">request {{ event.request_id }}</code>
          <code v-if="event.command_id">command {{ event.command_id }}</code>
        </div>
        <div class="timeline-detail">
          <span>client {{ event.client_release }} · {{ event.client_commit.slice(0, 12) }}</span>
          <span v-if="event.projection_revision !== null"
            >projection {{ event.projection_revision }}</span
          >
          <span v-if="event.sequence_gap">sequence gap {{ event.sequence_gap }}</span>
          <span v-if="event.late">late client clock</span>
          <code>{{ JSON.stringify(event.properties) }}</code>
        </div>
      </article>
      <p v-if="!admin.telemetryTimeline.length" class="dim">
        Enter at least one incident identifier to load a timeline.
      </p>
    </div>
  </ControlSection>
  <p v-if="admin.error" class="notice-err">{{ admin.error }}</p>
</template>

<style scoped>
.timeline-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.65rem;
}
.timeline-filters label {
  display: grid;
  gap: 0.25rem;
  color: var(--fg-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}
.timeline-actions {
  display: flex;
  align-items: end;
  gap: 0.5rem;
}
.timeline-list,
.timeline-event,
.timeline-identities,
.timeline-detail {
  display: grid;
  gap: 0.45rem;
}
.timeline-event {
  padding: 0.75rem;
  border-left: 3px solid var(--accent-color);
  background: var(--surface-muted);
}
.timeline-event.late {
  border-left-color: var(--state-warning);
}
.timeline-event-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  color: var(--fg-muted);
}
.timeline-event-head strong {
  color: var(--fg-strong);
}
.timeline-lane {
  color: var(--accent-color);
}
.timeline-identities {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}
.timeline-detail {
  color: var(--fg-muted);
}
</style>
