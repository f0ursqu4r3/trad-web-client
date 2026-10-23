export const telemetryEventNames = [
  'session_started',
  'session_resumed',
  'session_ended',
  'client_release_changed',
  'visibility_changed',
  'route_viewed',
  'workspace_tab_selected',
  'account_selected',
  'trade_selected',
  'settings_section_selected',
  'admin_section_selected',
  'release_notes_opened',
  'support_or_diagnostics_opened',
  'sync_state_changed',
  'projection_snapshot_applied',
  'projection_gap_detected',
  'reconciliation_banner_shown',
  'account_unavailable_shown',
  'action_presented',
  'action_unavailable_presented',
  'error_boundary_shown',
  'empty_state_shown',
  'action_opened',
  'action_blocked',
  'action_confirmed',
  'action_canceled',
  'action_abandoned',
  'action_submitted',
  'action_accepted',
  'action_rejected',
  'action_timed_out',
  'action_outcome_observed',
  'form_opened',
  'field_interacted',
  'validation_failed',
  'validation_cleared',
  'form_abandoned',
  'preview_requested',
  'preview_ready',
  'preview_rejected',
  'preview_guidance',
  'preview_superseded',
  'preview_timeout',
  'preview_transport_failed',
  'preview_stale',
  'affordability_changed',
  'submit_anyway_selected',
  'websocket_state_changed',
  'market_stream_state_changed',
  'websocket_lease_rotation_started',
  'websocket_lease_rotation_completed',
  'websocket_lease_rotation_failed',
  'request_queued',
  'request_sent',
  'response_received',
  'request_timeout',
  'owner_redirect_observed',
  'resnapshot_requested',
  'command_route_accepted',
  'command_route_rejected',
  'durable_command_linked',
  'command_terminal_observed',
  'venue_rejection_observed',
  'diagnostic_bundle_requested',
  'trade_id_copied',
  'account_id_copied',
  'reconnect_requested',
  'agent_rotation_started',
  'recovery_guidance_opened',
  'support_reference_copied',
  'connection_timing_measured',
  'client_work_measured',
  'trade_summary_mismatch',
  'trade_summary_shadow_measured',
] as const

export type TelemetryEventName = (typeof telemetryEventNames)[number]

export type TelemetryConnectionState = 'connected' | 'reconnecting' | 'offline' | 'unavailable'

export type TelemetryActionKind =
  | 'place_order'
  | 'place_chase'
  | 'place_trailing_entry'
  | 'amend_trailing_entry'
  | 'activate_trailing_entry'
  | 'continue_trailing_entry'
  | 'close_all'
  | 'partial_close'
  | 'cancel'
  | 'modify'
  | 'edit_protection'
  | 'rearm_protection'
  | 'take_over'
  | 'flatten'
  | 'set_leverage'
  | 'set_position_mode'
  | 'add_account'
  | 'update_account_metadata'
  | 'approve_builder'
  | 'refresh_builder_approval'
  | 'approve_agent'
  | 'refresh_agent_approval'
  | 'rotate_agent'
  | 'refresh_agent_connection'
  | 'replace_agent_connection'
  | 'select_agent_slot'
  | 'forget_agent_connection'
  | 'remove_account'
  | 'delete_account'
  | 'resolve_position'

export type TelemetryBlockerCode =
  | 'ACCOUNT_NOT_HYDRATED'
  | 'SYNC_UNAVAILABLE'
  | 'PROJECTION_STALE'
  | 'RECONCILIATION_REQUIRED'
  | 'POSITION_CONFIRMING'
  | 'POSITION_INCONSISTENT'
  | 'ACTIVE_CLOSE_EXISTS'
  | 'PROTECTION_NOT_TRACKING'
  | 'PROTECTION_AMENDMENT_ACTIVE'
  | 'INSUFFICIENT_MARGIN_LIKELY'
  | 'BALANCE_EVIDENCE_UNKNOWN'
  | 'MARKET_EVIDENCE_STALE'
  | 'CREDENTIAL_UNAVAILABLE'
  | 'AGENT_APPROVAL_REQUIRED'
  | 'ENTITLEMENT_DENIED'
  | 'TRANSPORT_OFFLINE'
  | 'COMMAND_REJECTED'
  | 'UNCLASSIFIED_BLOCKER'

export interface TelemetryProperties {
  action_kind?: TelemetryActionKind
  blocker_code?: TelemetryBlockerCode
  route_template?: string
  tab_id?: string
  section_id?: string
  control_id?: string
  field_name?: string
  interaction?: string
  state?: string
  previous_state?: string
  outcome_code?: string
  reason_code?: string
  response_code?: string
  duration_bucket?: string
  market_symbol?: string
  market_sample_age_bucket?: string
  sample_count?: number
  source?: string
  visibility_state?: string
  command_lifecycle?: string
  diagnostic_fingerprint?: string
  gap_size?: number
  queue_depth?: number
  retry_count?: number
  sampled?: boolean
  // connection_timing_measured (with market_symbol on first_price)
  stage?: 'socket_connected' | 'snapshot_applied' | 'first_price'
  elapsed_ms?: number
  payload_bytes?: number
  reconnect?: boolean
  // client_work_measured
  messages?: number
  bytes?: number
  apply_ms_p95?: number
  apply_ms_max?: number
  long_tasks?: number
  longest_task_ms?: number
  window_ms?: number
  // trade_summary_mismatch (with field_name and reason_code)
  summary_revision?: number
  client_digest?: string
  server_digest?: string
  // trade_summary_shadow_measured (with window_ms)
  cards?: number
  matched?: number
  mismatched?: number
  missing_summary?: number
  orphan_summary?: number
  comparisons?: number
  field_mismatches?: number
}
