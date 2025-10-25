import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useModalStore = defineStore('modals', () => {
  const modalStack = ref<string[]>([])

  const openModals = computed<Record<string, boolean>>(() => {
    return modalStack.value.reduce(
      (acc, name) => {
        acc[name] = true
        return acc
      },
      {} as Record<string, boolean>,
    )
  })

  const modalValues = ref<Record<string, unknown>>({})

  function openModal(name: string) {
    modalStack.value.push(name)
  }

  function openModalWithValues(name: string, values: Record<string, unknown>) {
    modalStack.value.push(name)
    modalValues.value[name] = values
  }

  function closeModal(name: string) {
    modalStack.value.splice(modalStack.value.indexOf(name), 1)
    delete modalValues.value[name]
  }

  function closeTopModal() {
    const name = modalStack.value.pop()
    if (name) {
      delete modalValues.value[name]
    }
  }

  function closeAllModals() {
    modalStack.value = []
    modalValues.value = {}
  }

  function isModalOpen(name: string): boolean {
    return !!openModals.value[name]
  }

  return {
    // State
    modalStack,
    openModals,
    modalValues,
    // Actions
    openModal,
    openModalWithValues,
    closeModal,
    closeTopModal,
    closeAllModals,
    isModalOpen,
  }
})
