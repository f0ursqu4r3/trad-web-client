<script setup lang="ts">
import { ref, type Ref } from 'vue'

import StickyScroller from '@/components/general/StickyScroller.vue'
import ThemeSwitcher from '@/components/general/ThemeSwitcher.vue'

const ssitems: Ref<Array<{ time: string; level: string; message: string }>> = ref([])
for (let i = 0; i < 100; i++) {
  ssitems.value.push({
    time: new Date().toLocaleTimeString(),
    level: 'INFO',
    message: `This is log message #${i + 1}`,
  })
}
</script>

<template>
  <div class="p-6 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
      <h1 class="text-xl font-mono m-0">UI Style Guide</h1>
      <div class="flex items-center gap-2">
        <span class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">Theme</span>
        <ThemeSwitcher />
      </div>
    </div>

    <section>
      <h2 class="text-lg font-mono mb-2">Buttons</h2>
      <div class="flex flex-col gap-3">
        <h3 class="font-mono text-sm">Variants</h3>
        <div class="flex flex-wrap gap-3 items-center">
          <button class="btn btn-primary">primary</button>
          <button class="btn btn-secondary">secondary</button>
          <button class="btn btn-danger">danger</button>
          <button class="btn btn-success">success</button>
          <button class="btn btn-neutral">neutral</button>
          <button class="btn btn-warn">warn</button>
          <button class="btn btn-info">info</button>
        </div>

        <h3 class="font-mono text-sm">Outline</h3>
        <div class="flex flex-wrap gap-3 items-center">
          <button class="btn btn-outline">outline</button>
          <button class="btn btn-outline-danger">outline danger</button>
          <button class="btn btn-outline-success">outline success</button>
          <button class="btn btn-outline-neutral">outline neutral</button>
          <button class="btn btn-outline-warn">outline warn</button>
          <button class="btn btn-outline-info">outline info</button>
        </div>

        <h3 class="font-mono text-sm">Ghost</h3>
        <div class="flex flex-wrap gap-3 items-center">
          <button class="btn btn-ghost">ghost</button>
          <button class="btn btn-ghost-danger">ghost danger</button>
          <button class="btn btn-ghost-success">ghost success</button>
          <button class="btn btn-ghost-neutral">ghost neutral</button>
          <button class="btn btn-ghost-warn">ghost warn</button>
          <button class="btn btn-ghost-info">ghost info</button>
        </div>

        <h3 class="font-mono text-sm">Sizes & States</h3>
        <div class="flex flex-wrap gap-3 items-center">
          <button class="btn btn-primary btn-sm">primary sm</button>
          <button class="btn btn-primary btn-lg">primary lg</button>
          <button class="btn icon-btn" aria-label="settings">⚙</button>
          <button class="btn btn-primary" aria-pressed="true">pressed</button>
          <button class="btn btn-secondary" disabled>disabled</button>
        </div>
      </div>
    </section>

    <section>
      <h2 class="text-lg font-mono mb-2">Pills</h2>
      <div class="flex flex-wrap gap-2 items-center">
        <span class="pill">default</span>
        <span class="pill-ok">ok</span>
        <span class="pill-err">err</span>
        <span class="pill-warn">warn</span>
        <span class="pill-info">info</span>
      </div>
    </section>

    <section>
      <h2 class="text-lg font-mono mb-2">Inputs</h2>
      <div class="space-y-3 max-w-md">
        <input class="input-term w-full" placeholder="Standard input" />
        <input class="input-term input-term-sm w-full" placeholder="Small input" />
        <input class="input-term input-term-lg w-full" placeholder="Large input" />
        <input class="input-term input-invalid w-full" value="invalid state" />
        <textarea class="textarea-term" placeholder="Textarea"></textarea>
      </div>
    </section>

    <section>
      <h2 class="text-lg font-mono mb-2">Notices</h2>
      <div class="space-y-1 text-[13px]">
        <p class="notice">Generic notice text</p>
        <p class="notice-ok">Success notice text</p>
        <p class="notice-err">Error notice text</p>
      </div>
    </section>

    <section>
      <h2 class="text-lg font-mono mb-2">Badges / Chips</h2>
      <div class="flex flex-wrap gap-2">
        <span class="badge">badge</span>
        <span class="chip">chip</span>
      </div>
    </section>

    <section>
      <h2 class="text-lg font-mono mb-2">Sticky Scroller</h2>
      <div class="h-64 w-96">
        <StickyScroller
          class="list striped"
          :trigger="ssitems.length"
          :smooth="true"
          :showButton="true"
        >
          <div v-for="(item, index) in ssitems" :key="index" class="row">
            <span class="time">{{ item.time }}</span>
            <span class="text-accent font-bold">{{ item.level }}</span>
            <pre class="payload">{{ item.message }}</pre>
          </div>
          <div v-if="ssitems.length === 0" class="empty">No log messages yet.</div>
        </StickyScroller>
      </div>
    </section>
  </div>
</template>

<style scoped>
.list {
  flex: 1;
  overflow: auto;
  font-size: 8pt;
  line-height: 1.2;
  padding: 2pt;
}
.row {
  display: grid;
  grid-template-columns: 64pt 64pt 1fr;
  gap: 4pt;
  padding: 2pt 0;
}
</style>
