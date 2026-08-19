<script setup lang="ts">
import { MousePointer2 } from 'lucide-vue-next'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{ sourceSelector: string; targetSelector: string; duration?: number }>(),
  { duration: 760 },
)
const emit = defineEmits<{ arrive: [] }>()
const visible = ref(false)
const moving = ref(false)
const arrived = ref(false)
const x = ref(0)
const y = ref(0)
let arrivalTimer: number | null = null

function pointAt(element: Element): { x: number; y: number } {
  const bounds = element.getBoundingClientRect()
  return { x: bounds.left + bounds.width / 2 - 3, y: bounds.top + bounds.height / 2 - 2 }
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function begin(): Promise<void> {
  await nextTick()
  await frame()
  const source = document.querySelector(props.sourceSelector)
  const target = document.querySelector(props.targetSelector)
  if (!source || !target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    emit('arrive')
    return
  }

  const start = pointAt(source)
  x.value = start.x
  y.value = start.y
  visible.value = true
  await frame()
  moving.value = true
  const finish = pointAt(target)
  x.value = finish.x
  y.value = finish.y
  arrivalTimer = window.setTimeout(() => {
    arrived.value = true
    arrivalTimer = window.setTimeout(() => emit('arrive'), 220)
  }, props.duration)
}

onMounted(begin)
onBeforeUnmount(() => {
  if (arrivalTimer !== null) window.clearTimeout(arrivalTimer)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="guided-pointer"
      :class="{ moving, arrived }"
      :style="{ '--tour-duration': `${duration}ms`, transform: `translate3d(${x}px, ${y}px, 0)` }"
      aria-hidden="true"
    >
      <MousePointer2 :size="20" />
    </div>
  </Teleport>
</template>

<style scoped>
.guided-pointer {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10000;
  color: var(--state-warning);
  opacity: 0;
  pointer-events: none;
  filter: drop-shadow(0 1px 1px #000);
}
.guided-pointer.moving {
  opacity: 1;
  transition:
    transform var(--tour-duration) cubic-bezier(0.42, 0, 0.2, 1),
    opacity 120ms ease;
}
.guided-pointer::after {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 28px;
  height: 28px;
  border: 1px solid var(--state-warning);
  border-radius: 50%;
  content: '';
  opacity: 0;
}
.guided-pointer.arrived::after {
  animation: guided-click 220ms ease-out;
}
@keyframes guided-click {
  0% {
    opacity: 0.9;
    transform: scale(0.35);
  }
  100% {
    opacity: 0;
    transform: scale(1.25);
  }
}
</style>
