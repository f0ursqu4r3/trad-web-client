const OPEN_PALETTE_EVENT = 'trad:open-command-palette'

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))
}

export function commandPaletteShortcut(): string {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘+K' : 'Ctrl+K'
}

export function listenForCommandPaletteOpen(listener: () => void): () => void {
  window.addEventListener(OPEN_PALETTE_EVENT, listener)
  return () => window.removeEventListener(OPEN_PALETTE_EVENT, listener)
}
