<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useUserStore } from '@/stores/user'
import { useWsStore } from '@/stores/ws'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'
import { apiPut } from '@/lib/apiClient'
import { useAuth0 } from '@auth0/auth0-vue'
import CreateAccountModal from '@/components/terminal/modals/CreateAccountModal.vue'

import ThemeSwitcher from '@/components/general/ThemeSwitcher.vue'
import OrderedList from '@/components/general/OrderedList.vue'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

// Stores
const userStore = useUserStore()
const wsStore = useWsStore()
const accountsStore = useAccountsStore()
const { logout, isAuthenticated } = useAuth0()

// Local editable preferences JSON
const prefsEditor = ref('')
const prefsDirty = ref(false)
const prefsError = ref<string | null>(null)
const prefsSaving = ref(false)
const prefsSavedAt = ref<number | null>(null)

const isCreateAccountOpen = ref(false)

// Load editor content from store when (a) modal opens or (b) store.preferences changes
watch(
  () => [props.open, userStore.profile?.meta?.preferences],
  ([isOpen]) => {
    if (isOpen) {
      prefsEditor.value = JSON.stringify(userStore.profile?.meta?.preferences ?? {}, null, 2)
      prefsDirty.value = false
      prefsError.value = null
    }
  },
  { immediate: true },
)

// Preferences saving logic
async function savePreferences() {
  prefsError.value = null
  let parsed: unknown
  try {
    parsed = JSON.parse(prefsEditor.value || '{}')
  } catch (e) {
    prefsError.value = 'Invalid JSON: ' + (e instanceof Error ? e.message : String(e))
    return
  }
  prefsSaving.value = true
  try {
    // Assumption: backend accepts PUT /me/preferences with full object & returns updated prefs
    const updated = await apiPut<Record<string, unknown>>(
      '/me/preferences',
      parsed as Record<string, unknown>,
      {
        throwOnHTTPError: true,
      },
    )
    userStore.profile!.meta = userStore.profile!.meta || { preferences: {} }
    userStore.profile!.meta.preferences = updated
    prefsDirty.value = false
    prefsSavedAt.value = Date.now()
  } catch (e) {
    prefsError.value = e instanceof Error ? e.message : String(e)
  } finally {
    prefsSaving.value = false
  }
}

// Handle editor changes
function onPrefsInput() {
  prefsDirty.value = true
}

// Refresh account info
async function refreshAccount() {
  await userStore.fetchMe()
  await accountsStore.fetchAccounts()
}

// WS helpers
function reconnectWs() {
  wsStore.disconnect()
  setTimeout(() => wsStore.connect(), 50)
}
function sendPing() {
  wsStore.sendSystemPing()
}

function close() {
  emit('close')
}

function openCreateAccount() {
  isCreateAccountOpen.value = true
}

async function deleteAccount(account: AccountRecord) {
  if (!window.confirm(`Delete account "${account.label}"? This cannot be undone.`)) return
  try {
    await accountsStore.removeAccount(account.label)
  } catch (err) {
    prefsError.value = err instanceof Error ? err.message : String(err)
  }
}

function handleAccountsReorder(nextItems: unknown[]) {
  if (!Array.isArray(nextItems)) return
  accountsStore.reorderAccounts(nextItems as AccountRecord[])
}

// Global key handling (Esc to close)
function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// Success / status helpers
const prefsSavedRecently = computed(() => {
  if (!prefsSavedAt.value) return false
  return Date.now() - prefsSavedAt.value < 4000
})

// Derived states
const accountLoading = computed(() => userStore.loading)
const accountError = computed(() => userStore.error)

// When opening, if no profile yet & not loading, fetch
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && !userStore.profile && !userStore.loading && isAuthenticated.value) {
      userStore.fetchMe()
    }
    if (isOpen && isAuthenticated.value) {
      accountsStore.fetchAccounts().catch((err) => {
        prefsError.value = err instanceof Error ? err.message : String(err)
      })
    }
  },
  { immediate: true },
)

// Logout redirect origin constant to avoid template global lookup typing issues
const returnToOrigin = window.location.origin

// Assumption doc: No dedicated preferences update route defined in repo; using PUT /me/preferences.
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[500] flex items-start justify-center overflow-auto bg-black/60 p-6 backdrop-blur-sm"
        aria-modal="true"
        role="dialog"
        @click.self="close"
      >
        <div
          class="relative mx-auto w-full max-w-4xl flex flex-col max-h-[80vh] rounded-lg border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--color-text)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--border-color)_65%,transparent),0_8px_28px_rgba(0,0,0,0.45)]"
          role="document"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between px-3 py-2 text-[12px] uppercase tracking-wide bg-[linear-gradient(180deg,color-mix(in_srgb,var(--panel-header-bg)_85%,transparent),color-mix(in_srgb,var(--panel-header-bg)_100%,transparent))] border-b border-[var(--border-color)] text-[var(--color-text-dim)] backdrop-blur-sm"
          >
            <div class="flex items-center gap-2">
              <span class="text-[var(--accent-color)]">User Settings</span>
              <span class="text-[var(--color-text-dim)]/70" v-if="userStore.profile">
                ( {{ userStore.displayName }} )
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                class="btn btn-secondary btn-sm"
                @click="refreshAccount"
                :disabled="accountLoading"
              >
                Refresh
              </button>
              <button class="btn btn-secondary btn-sm" @click="close">Close</button>
            </div>
          </div>

          <!-- Body Scroll -->
          <div class="max-h-[75vh] overflow-auto p-4 space-y-8 text-[13px] leading-snug">
            <!-- Account Section -->
            <section>
              <header
                class="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-[var(--accent-color)]"
              >
                <span>Account</span>
                <span class="pill-info" v-if="accountLoading">loading...</span>
                <span class="pill-err" v-if="accountError">error</span>
              </header>
              <div v-if="!isAuthenticated">Not authenticated.</div>
              <div
                v-else-if="!userStore.profile && !accountLoading"
                class="text-[var(--color-text-dim)]"
              >
                Profile not loaded.
              </div>
              <div v-else-if="userStore.profile" class="grid gap-2 sm:grid-cols-2">
                <div>
                  <div class="dim text-[11px]">User ID</div>
                  <div>{{ userStore.userId || '—' }}</div>
                </div>
                <div>
                  <div class="dim text-[11px]">Display Name</div>
                  <div>{{ userStore.displayName || '—' }}</div>
                </div>
              </div>
              <div v-if="isAuthenticated" class="mt-4 space-y-2">
                <div
                  class="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]"
                >
                  <span>Trading Accounts</span>
                  <div class="flex items-center gap-2">
                    <button
                      class="btn btn-secondary btn-xs"
                      :disabled="accountsStore.loading"
                      @click="accountsStore.fetchAccounts()"
                    >
                      Refresh
                    </button>
                    <button class="btn btn-primary btn-xs" @click="openCreateAccount">New</button>
                  </div>
                </div>
                <p v-if="accountsStore.error" class="notice-err">{{ accountsStore.error }}</p>
                <p
                  v-else-if="accountsStore.loading && !accountsStore.accounts.length"
                  class="notice-info"
                >
                  Loading accounts...
                </p>
                <OrderedList
                  v-else-if="accountsStore.accounts.length"
                  :items="accountsStore.accounts"
                  item-key="id"
                  @update:items="handleAccountsReorder"
                >
                  <template #default="{ item: account, index }">
                    <div
                      class="flex items-center justify-between gap-3 p-2 border rounded-md bg-[var(--panel-bg-alt)] border-[var(--border-color)]"
                    >
                      <div class="flex items-center gap-3">
                        <span v-if="index < 9" class="kbd">ctrl+{{ index + 1 }}</span>
                        <div class="flex flex-col gap-1">
                          <div class="font-medium text-sm text-[var(--color-text)]">
                            {{ (account as AccountRecord).label }}
                          </div>
                          <div class="text-[11px] text-[var(--color-text-dim)]">
                            {{ (account as AccountRecord).network || 'Unknown network' }}
                          </div>
                        </div>
                      </div>

                      <div class="flex items-center gap-2">
                        <button
                          class="btn btn-ghost btn-xs text-red-400"
                          @click="deleteAccount(account as AccountRecord)"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </template>
                </OrderedList>
                <p v-else class="notice-info">No trading accounts configured.</p>
              </div>
              <div v-if="accountError" class="notice-err mt-2">{{ accountError }}</div>
            </section>

            <hr class="section-divider" />

            <!-- Session / Connection -->
            <section>
              <header
                class="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-[var(--accent-color)]"
              >
                <span>Session</span>
              </header>
              <div class="grid gap-2 sm:grid-cols-3">
                <div>
                  <div class="dim text-[11px]">Auth Status</div>
                  <div>{{ isAuthenticated ? 'authenticated' : 'anonymous' }}</div>
                </div>
                <div>
                  <div class="dim text-[11px]">WS Status</div>
                  <div>
                    <span
                      :class="{
                        'pill-info': wsStore.status === 'connecting',
                        'pill-ok': wsStore.status === 'ready',
                        'pill-warn': wsStore.status === 'reconnecting',
                        'pill-err': wsStore.status === 'error',
                      }"
                      class="pill"
                    >
                      {{ wsStore.status }}
                    </span>
                  </div>
                </div>
                <div>
                  <div class="dim text-[11px]">Latency</div>
                  <div>
                    {{ wsStore.latencyMs != null ? wsStore.latencyMs.toFixed(0) + ' ms' : '—' }}
                  </div>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  class="btn btn-secondary btn-sm"
                  @click="sendPing"
                  :disabled="wsStore.status !== 'ready'"
                >
                  Ping
                </button>
                <button class="btn btn-secondary btn-sm" @click="reconnectWs">Reconnect WS</button>
                <button
                  class="btn btn-danger btn-sm"
                  @click="logout({ logoutParams: { returnTo: returnToOrigin } })"
                >
                  Logout
                </button>
              </div>
            </section>

            <hr class="section-divider" />

            <!-- Appearance -->
            <section>
              <header
                class="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-[var(--accent-color)]"
              >
                <span>Appearance</span>
              </header>
              <div class="flex items-center gap-3">
                <div class="dim text-[11px]">Theme Mode</div>
                <ThemeSwitcher />
              </div>
            </section>

            <hr class="section-divider" />

            <!-- Preferences JSON -->
            <section>
              <header
                class="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-[var(--accent-color)]"
              >
                <span>Preferences</span>
                <span v-if="prefsDirty && !prefsSaving" class="pill-warn">modified</span>
                <span v-if="prefsSaving" class="pill-info">saving...</span>
                <span v-if="prefsSavedRecently" class="pill-ok">saved</span>
              </header>
              <p class="muted mb-2">Edit raw JSON preferences. Save replaces the full object.</p>
              <textarea
                v-model="prefsEditor"
                @input="onPrefsInput"
                class="textarea font-mono h-56 w-full text-[12px]"
                spellcheck="false"
              ></textarea>
              <div class="mt-2 flex items-center gap-2">
                <button
                  class="btn btn-primary btn-sm"
                  :disabled="!prefsDirty || prefsSaving"
                  @click="savePreferences"
                >
                  Save Preferences
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  :disabled="!prefsDirty || prefsSaving"
                  @click="
                    () => {
                      prefsEditor = JSON.stringify(
                        userStore.profile?.meta?.preferences ?? {},
                        null,
                        2,
                      )
                      prefsDirty = false
                      prefsError = null
                    }
                  "
                >
                  Reset
                </button>
              </div>
              <div v-if="prefsError" class="notice-err">{{ prefsError }}</div>
              <div v-else-if="prefsSavedRecently" class="notice-ok">Preferences saved.</div>
            </section>
          </div>
          <CreateAccountModal :open="isCreateAccountOpen" @close="isCreateAccountOpen = false" />
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* styles replaced by Tailwind utility classes in template */

/* Adapt badges/pills if inside modal (ensures contrast in light/dark) */
:deep(.badge) {
  background: color-mix(in srgb, var(--panel-header-bg) 90%, transparent);
  border-color: var(--border-color);
}

:deep(.pill) {
  background: color-mix(in srgb, var(--panel-header-bg) 80%, transparent);
  border: 1px solid var(--border-color);
}
</style>
