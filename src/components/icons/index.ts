import { h } from 'vue'
import type { FunctionalComponent } from 'vue'

export const SunIcon: FunctionalComponent<{ size?: number }> = (props) => {
  const size = props.size ?? 16
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      role: 'img',
      'aria-label': 'Light theme',
      class: 'theme-icon sun-icon',
    },
    [
      h('circle', { cx: 12, cy: 12, r: 5 }),
      h('line', { x1: 12, y1: 1, x2: 12, y2: 3 }),
      h('line', { x1: 12, y1: 21, x2: 12, y2: 23 }),
      h('line', { x1: 4.22, y1: 4.22, x2: 5.64, y2: 5.64 }),
      h('line', { x1: 18.36, y1: 18.36, x2: 19.78, y2: 19.78 }),
      h('line', { x1: 1, y1: 12, x2: 3, y2: 12 }),
      h('line', { x1: 21, y1: 12, x2: 23, y2: 12 }),
      h('line', { x1: 4.22, y1: 19.78, x2: 5.64, y2: 18.36 }),
      h('line', { x1: 18.36, y1: 5.64, x2: 19.78, y2: 4.22 }),
    ],
  )
}
SunIcon.displayName = 'SunIcon'

export const MoonIcon: FunctionalComponent<{ size?: number }> = (props) => {
  const size = props.size ?? 16
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      role: 'img',
      'aria-label': 'Dark theme',
      class: 'theme-icon moon-icon',
    },
    [h('path', { d: 'M21 12.79A9 9 0 0 1 11.21 3 7 7 0 0 0 12 21a9 9 0 0 0 9-8.21Z' })],
  )
}
MoonIcon.displayName = 'MoonIcon'

export const DownIcon: FunctionalComponent<{ size?: number }> = (props) => {
  const size = props.size ?? 16
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      role: 'img',
      'aria-label': 'Down arrow',
      class: 'icon down-icon',
    },
    [h('polyline', { points: '6 9 12 15 18 9' })],
  )
}
DownIcon.displayName = 'DownIcon'

export default { SunIcon, MoonIcon, DownIcon }
