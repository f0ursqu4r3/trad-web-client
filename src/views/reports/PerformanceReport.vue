<script setup lang="ts">
import { useHead } from '@unhead/vue'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'
import PublicPage from '@/layouts/PublicPage.vue'
import { currentProductRelease, updatesPreviewPath } from '@/lib/releases'
import DeployPauseChart from './DeployPauseChart.vue'
import MethodTag from './MethodTag.vue'
import ReportTable from './ReportTable.vue'
import reports from './reports.json' with { type: 'json' }
import {
  headlines,
  measurementCount,
  methodLegend,
  reportMeta,
  sections,
  unitRule,
} from './performance-2026-10'
import { formatFactor, formatValue, improvementFactor } from './reportFormat'

const report = reports.find((entry) => entry.path === '/reports/performance-2026-10/')!
const shown = measurementCount()

const canonical = new URL(report.path, window.location.origin).href
const image = new URL(
  updatesPreviewPath(currentProductRelease().version, window.location.hostname),
  window.location.origin,
).href
useHead({
  title: report.title,
  link: [{ rel: 'canonical', href: canonical }],
  meta: [
    { name: 'description', content: report.description },
    { property: 'og:type', content: 'article' },
    { property: 'og:title', content: report.title },
    { property: 'og:description', content: report.description },
    { property: 'og:url', content: canonical },
    { property: 'og:image', content: image },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: report.title },
    { name: 'twitter:description', content: report.description },
    { name: 'twitter:image', content: image },
  ],
})
</script>

<template>
  <PublicPage>
    <article class="performance-report">
      <ControlPageHeader
        eyebrow="Engineering report"
        :title="reportMeta.title"
        description="Latency, memory, bandwidth and deploy time before and after, across the releases below."
      />

      <ControlSection title="Report" :description="reportMeta.method">
        <div class="control-detail-grid">
          <div>
            <span>Date</span
            ><strong
              ><time :datetime="reportMeta.date">{{ reportMeta.date }}</time></strong
            >
          </div>
          <div>
            <span>Period</span><strong>{{ reportMeta.period }}</strong>
          </div>
          <div>
            <span>Releases</span><strong>{{ reportMeta.releases }}</strong>
          </div>
          <div>
            <span>Measurements</span><strong>{{ shown }} shown of ~230 recorded</strong>
          </div>
        </div>
        <dl class="report-legend">
          <div v-for="entry in methodLegend" :key="entry.method">
            <dt><MethodTag :method="entry.method" /></dt>
            <dd>
              <strong>{{ entry.label }}</strong> {{ entry.detail }}
            </dd>
          </div>
        </dl>
        <p class="report-note">{{ unitRule }}</p>
        <p class="report-note">{{ reportMeta.fixtures }}</p>
      </ControlSection>

      <ControlSection title="Summary">
        <div class="headline-grid">
          <div v-for="item in headlines" :key="item.label" class="headline">
            <div class="headline-label">{{ item.label }}</div>
            <div class="headline-values">
              <span class="headline-before">{{ formatValue(item.before) }}</span>
              <span class="headline-arrow" aria-label="to">→</span>
              <span class="headline-after">{{ formatValue(item.after) }}</span>
            </div>
            <div class="headline-foot">
              <span class="headline-factor">{{
                formatFactor(improvementFactor(item.before, item.after))
              }}</span>
              <span class="headline-note">{{ item.note }}</span>
              <MethodTag :method="item.method" />
            </div>
          </div>
        </div>
      </ControlSection>

      <ControlSection
        v-for="section in sections"
        :id="section.id"
        :key="section.id"
        :title="section.title"
        :description="section.line"
      >
        <ReportTable v-for="(table, index) in section.tables" :key="index" :table="table" />
        <template v-if="section.chart === 'deploy-pause'">
          <DeployPauseChart />
          <p v-if="section.caption" class="report-note">
            {{ section.caption }} <MethodTag method="production" />
          </p>
        </template>
        <ol v-if="section.list" class="report-gaps">
          <li v-for="item in section.list" :key="item">{{ item }}</li>
        </ol>
      </ControlSection>
    </article>
  </PublicPage>
</template>

<style scoped>
.performance-report :deep(.control-section-body) {
  overflow-x: hidden;
}
.performance-report .control-detail-grid {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
.report-legend {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0.45rem 1.25rem;
  margin: 1rem 0 0;
  padding-top: 1rem;
  border-top: 1px solid var(--border-subtle);
}
.report-legend > div {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}
.report-legend dd {
  margin: 0;
  color: var(--fg-muted);
  font-size: 12px;
}
.report-legend dd strong {
  color: var(--fg-strong);
  font-weight: 400;
}
.report-note {
  margin: 0.75rem 0 0;
  color: var(--fg-muted);
  font-size: 12px;
}
.headline-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1px;
  border: 1px solid var(--border-subtle);
  background: var(--border-subtle);
}
.headline {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 0.45rem;
  padding: 0.8rem 0.9rem;
  background: var(--surface-base);
}
.headline-label {
  color: var(--fg-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.headline-values {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.45rem;
  font-variant-numeric: tabular-nums;
}
.headline-before {
  color: var(--fg-muted);
  font-size: 13px;
}
.headline-arrow {
  color: var(--fg-muted);
}
.headline-after {
  color: var(--fg-strong);
  font-size: 16px;
}
.headline-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  color: var(--fg-muted);
  font-size: 11px;
}
.headline-factor {
  color: var(--fg-strong);
  font-variant-numeric: tabular-nums;
}
.headline-note {
  flex: 1;
  min-width: 0;
}
.report-gaps {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding-left: 1.4rem;
  color: var(--fg);
  font-size: 13px;
}
</style>
