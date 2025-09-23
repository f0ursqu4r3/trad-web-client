import { h } from 'vue'
import type { FunctionalComponent } from 'vue'

const base = (size: number, ariaLabel: string, className: string) => ({
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
  'aria-label': ariaLabel,
  class: className,
})

export const SunIcon: FunctionalComponent<{ size?: number }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Light theme', 'theme-icon sun-icon'), [
    h('circle', { cx: 12, cy: 12, r: 5 }),
    h('line', { x1: 12, y1: 1, x2: 12, y2: 3 }),
    h('line', { x1: 12, y1: 21, x2: 12, y2: 23 }),
    h('line', { x1: 4.22, y1: 4.22, x2: 5.64, y2: 5.64 }),
    h('line', { x1: 18.36, y1: 18.36, x2: 19.78, y2: 19.78 }),
    h('line', { x1: 1, y1: 12, x2: 3, y2: 12 }),
    h('line', { x1: 21, y1: 12, x2: 23, y2: 12 }),
    h('line', { x1: 4.22, y1: 19.78, x2: 5.64, y2: 18.36 }),
    h('line', { x1: 18.36, y1: 5.64, x2: 19.78, y2: 4.22 }),
  ])
}
SunIcon.displayName = 'SunIcon'

export const MoonIcon: FunctionalComponent<{ size?: number }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Dark theme', 'theme-icon moon-icon'), [
    h('path', { d: 'M21 12.79A9 9 0 0 1 11.21 3 7 7 0 0 0 12 21a9 9 0 0 0 9-8.21Z' }),
  ])
}
MoonIcon.displayName = 'MoonIcon'

export const DownIcon: FunctionalComponent<{ size?: number }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Expand', 'icon down-icon'), [
    h('polyline', { points: '6 9 12 15 18 9' }),
  ])
}
DownIcon.displayName = 'DownIcon'

export const LogoutIcon: FunctionalComponent<{ size?: number }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Logout', 'icon logout-icon'), [
    h('path', {
      d: 'M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15',
    }),
  ])
}
LogoutIcon.displayName = 'LogoutIcon'

export default { SunIcon, MoonIcon, DownIcon, LogoutIcon }
