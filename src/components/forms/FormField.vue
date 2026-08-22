<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue'
import { CircleHelp } from 'lucide-vue-next'

const props = defineProps<{
  label?: string
  help?: string
  hint?: string
  error?: string | null
  required?: boolean
  optional?: boolean
  eagerError?: boolean
}>()

let nextFieldId = 0
const errorId = `form-field-error-${++nextFieldId}`
const root = ref<HTMLLabelElement | null>(null)
const interacted = ref(false)
const submitted = ref(false)
const missing = ref(false)
let form: HTMLFormElement | null = null

const effectiveError = computed(() => {
  if (props.error) return props.error
  if (!props.required || !missing.value) return null
  return `${props.label || 'This field'} is required`
})
const visibleError = computed(() =>
  props.eagerError || interacted.value || submitted.value ? effectiveError.value : null,
)
const showRequiredCue = computed(
  () => props.required && missing.value && visibleError.value === null,
)

function primaryControl(): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null {
  return (
    root.value?.querySelector(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea',
    ) ?? null
  )
}

function controlIsMissing(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): boolean {
  if (control.disabled) return false
  return control.value.trim() === ''
}

function syncControl(): void {
  const control = primaryControl()
  missing.value = control ? controlIsMissing(control) : false
  if (!control) return

  control.required = Boolean(props.required)
  if (props.required) control.setAttribute('aria-required', 'true')
  else control.removeAttribute('aria-required')

  if (visibleError.value) {
    control.setAttribute('aria-invalid', 'true')
    const describedBy = new Set(
      (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean),
    )
    describedBy.add(errorId)
    control.setAttribute('aria-describedby', [...describedBy].join(' '))
  } else {
    control.removeAttribute('aria-invalid')
    const describedBy = (control.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== errorId)
    if (describedBy.length) control.setAttribute('aria-describedby', describedBy.join(' '))
    else control.removeAttribute('aria-describedby')
  }
}

function markInteracted(): void {
  interacted.value = true
  syncControl()
}

function markSubmitted(): void {
  submitted.value = true
  syncControl()
}

function attachForm(): void {
  const nextForm = primaryControl()?.form ?? null
  if (form === nextForm) return
  form?.removeEventListener('submit', markSubmitted, true)
  form = nextForm
  form?.addEventListener('submit', markSubmitted, true)
}

onMounted(() => {
  syncControl()
  attachForm()
})
onUpdated(() => {
  syncControl()
  attachForm()
})
watch(visibleError, () => nextTick(syncControl))
onBeforeUnmount(() => form?.removeEventListener('submit', markSubmitted, true))
</script>

<template>
  <label
    ref="root"
    class="field form-field"
    :class="{
      'form-field-invalid': visibleError,
      'form-field-required-empty': showRequiredCue,
    }"
    @input="syncControl"
    @change="syncControl"
    @focusout.capture="markInteracted"
    @invalid.capture="markSubmitted"
  >
    <span class="form-field-heading" :title="help">
      <span
        ><slot name="label">{{ label }}</slot></span
      >
      <span v-if="optional" class="form-field-optional">optional</span>
      <span v-if="help" class="form-field-help" :title="help" aria-hidden="true">
        <CircleHelp :size="12" />
      </span>
    </span>
    <span class="form-field-control">
      <slot />
      <span v-if="showRequiredCue" class="form-field-required-cue" aria-hidden="true">
        Required
      </span>
    </span>
    <small v-if="visibleError" :id="errorId" class="field-error" role="alert">{{
      visibleError
    }}</small>
    <small v-else-if="hint" class="field-hint">{{ hint }}</small>
  </label>
</template>
