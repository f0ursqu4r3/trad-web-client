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

export const CogIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Settings', 'icon cog-icon'), [
    h('path', {
      d: 'M4.5 12a7.5 7.5 0 0 0 15 0m-15 0a7.5 7.5 0 1 1 15 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077 1.41-.513m14.095-5.13 1.41-.513M5.106 17.785l1.15-.964m11.49-9.642 1.149-.964M7.501 19.795l.75-1.3m7.5-12.99.75-1.3m-6.063 16.658.26-1.477m2.605-14.772.26-1.477m0 17.726-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205 12 12m6.894 5.785-1.149-.964M6.256 7.178l-1.15-.964m15.352 8.864-1.41-.513M4.954 9.435l-1.41-.514M12.002 12l-3.75 6.495',
    }),
  ])
}
CogIcon.displayName = 'CogIcon'

export const BoltIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Synthwave theme', 'theme-icon bolt-icon'), [
    h('path', { d: 'm3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z' }),
  ])
}
BoltIcon.displayName = 'BoltIcon'

export const ComputerDesktopIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Computer Desktop', 'icon computer-desktop-icon'), [
    h('path', {
      d: 'M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25',
    }),
  ])
}
ComputerDesktopIcon.displayName = 'ComputerDesktopIcon'

export const StarIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Star', 'icon star-icon'), [
    h('path', {
      d: 'M11.48 3.499a.562.562 0 0 0-1.016 0l-2.125 4.308-4.752.692a.563.563 0 0 0-.312.959l3.438 3.356-.812 4.73a.563.563 0 0 0 .816.594L12 16.347l4.253 2.235a.563.563 0 0 0 .816-.594l-.812-4.73 3.438-3.356a.563.563 0 0 0-.312-.959l-4.752-.692-2.125-4.308Z',
    }),
  ])
}
StarIcon.displayName = 'StarIcon'

export const SparklesIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Sparkles', 'icon sparkles-icon'), [
    h('path', {
      d: 'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z',
    }),
  ])
}
SparklesIcon.displayName = 'SparklesIcon'

export const XIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Close', 'icon x-icon'), [
    h('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
    h('line', { x1: 6, y1: 6, x2: 18, y2: 18 }),
  ])
}
XIcon.displayName = 'XIcon'

export const UnoReverseIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Uno Reverse', 'icon uno-reverse-icon'), [
    h('path', {
      d: 'M11 13.242641 L15.242641 13.242641 M15.242641 13.242641 L15.242641 17.485281 M15.242641 13.242641 L11 17.485281 C9.32842712 19.1568542 6.82842712 19.1568542 5.15685425 17.4852814 C3.48528137 15.8137085 3.48528137 13.3137085 5.15685425 11.6421356 L6.36396103 10.4340288 M11 7.75735931 L5.15685425 7.75735931 M5.15685425 7.75735931 L5.15685425 2.91421356 M5.15685425 7.75735931 L11 2.91421356 C12.6715729 1.24264069 15.1715729 1.24264069 16.8431458 2.91421356 C18.5147187 4.58578644 18.5147187 7.08578644 16.8431458 8.75735931 L15.636039 9.96446609',
    }),
  ])
}
UnoReverseIcon.displayName = 'UnoReverseIcon'

export const PlusIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Add', 'icon plus-icon'), [
    h('line', {
      x1: 12,
      y1: 4.5,
      x2: 12,
      y2: 19.5,
      'stroke-width': 1.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
    h('line', {
      x1: 19.5,
      y1: 12,
      x2: 4.5,
      y2: 12,
      'stroke-width': 1.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  ])
}
PlusIcon.displayName = 'PlusIcon'

export const ArrowPathIcon: FunctionalComponent<{ size?: number | string }> = (props) => {
  const size = props.size ?? 16
  return h('svg', base(size, 'Refresh', 'icon arrow-path-icon'), [
    h('path', {
      d: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99',
      'stroke-width': 1.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  ])
}
ArrowPathIcon.displayName = 'ArrowPathIcon'

export default {
  ArrowPathIcon,
  BoltIcon,
  CogIcon,
  ComputerDesktopIcon,
  DownIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  LogoutIcon,
  MagnifyingGlassIcon,
  MenuDotsIcon,
  MoonIcon,
  PlusIcon,
  SparklesIcon,
  StarIcon,
  SunIcon,
  UnoReverseIcon,
  XIcon,
}
