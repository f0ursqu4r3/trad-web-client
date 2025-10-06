<template>
  <div class="p-6 space-y-8">
    <h1 class="text-xl font-mono">UI Style Guide</h1>

    <section>
      <h2 class="text-lg font-mono mb-2">Buttons</h2>
      <div class="flex flex-wrap gap-3 items-center">
        <button class="btn btn-primary">primary</button>
        <button class="btn btn-secondary">secondary</button>
        <button class="btn btn-danger">danger</button>
        <button class="btn btn-success">success</button>
        <button class="btn btn-outline">outline</button>
        <button class="btn btn-outline-danger">outline danger</button>
        <button class="btn btn-outline-success">outline success</button>
        <button class="btn btn-outline-neutral">outline neutral</button>
        <button class="btn btn-ghost">ghost</button>
        <button class="btn btn-ghost-danger">ghost danger</button>
        <button class="btn btn-ghost-success">ghost success</button>
        <button class="btn btn-ghost-neutral">ghost neutral</button>
        <button class="btn btn-primary btn-sm">primary sm</button>
        <button class="btn btn-primary btn-lg">primary lg</button>
        <button class="btn icon-btn" aria-label="settings">⚙</button>
        <button class="btn btn-primary" aria-pressed="true">pressed</button>
        <button class="btn btn-secondary" disabled>disabled</button>
      </div>
    </section>

    <section>
      <h2 class="text-lg font-mono mb-2">Pills</h2>
      <div class="flex flex-wrap gap-2 items-center">
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
  </div>
</template>

<script setup lang="ts">
// Style guide view for visual regression & manual QA
</script>
