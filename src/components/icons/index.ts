import { h } from 'vue'
import type { FunctionalComponent } from 'vue'

const base = (size: number | string, ariaLabel: string, className: string) => ({
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

export const SunIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
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

export const MoonIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Dark theme', 'theme-icon moon-icon'), [
    h('path', { d: 'M21 12.79A9 9 0 0 1 11.21 3 7 7 0 0 0 12 21a9 9 0 0 0 9-8.21Z' }),
  ])
}
MoonIcon.displayName = 'MoonIcon'

export const DownIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Expand', 'icon down-icon'), [
    h('polyline', { points: '6 9 12 15 18 9' }),
  ])
}
DownIcon.displayName = 'DownIcon'

export const LogoutIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Logout', 'icon logout-icon'), [
    h('path', {
      d: 'M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15',
    }),
  ])
}
LogoutIcon.displayName = 'LogoutIcon'

export const MenuDotsIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Menu', 'icon menu-dots-icon'), [
    h('circle', { cx: 12, cy: 5, r: 1 }),
    h('circle', { cx: 12, cy: 12, r: 1 }),
    h('circle', { cx: 12, cy: 19, r: 1 }),
  ])
}
MenuDotsIcon.displayName = 'MenuDotsIcon'

export const MagnifyingGlassIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Search', 'icon search-icon'), [
    h('circle', { cx: 11, cy: 11, r: 8 }),
    h('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
  ])
}
MagnifyingGlassIcon.displayName = 'MagnifyingGlassIcon'

export const FolderIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Folder', 'icon folder-icon'), [
    h('path', {
      d: 'M3 7.5A2.25 2.25 0 0 1 5.25 5.25h3.379c.398 0 .779.158 1.06.44l2.121 2.121c.282.282.662.44 1.06.44H18A2.25 2.25 0 0 1 20.25 10v8.25A2.25 2.25 0 0 1 18 20.5H5.25A2.25 2.25 0 0 1 3 18.25z',
    }),
  ])
}
FolderIcon.displayName = 'FolderIcon'

export const FolderOpenIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Folder Open', 'icon folder-open-icon'), [
    h('path', {
      d: 'M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776',
    }),
  ])
}
FolderOpenIcon.displayName = 'FolderOpenIcon'

export const FileIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'File', 'icon file-icon'), [
    h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    h('polyline', { points: '14 2 14 8 20 8' }),
  ])
}
FileIcon.displayName = 'FileIcon'

export default {
  SunIcon,
  MoonIcon,
  DownIcon,
  LogoutIcon,
  MenuDotsIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
}
