export interface LongPressHandlers<T> {
  start: (event: PointerEvent, value: T) => void
  move: (event: PointerEvent) => void
  end: () => void
  suppressClick: (event: MouseEvent) => void
}

export function longPress<T>(open: (value: T, x: number, y: number) => void): LongPressHandlers<T> {
  let timer: number | null = null
  let origin: { x: number; y: number } | null = null
  let fired = false

  const end = () => {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
    origin = null
  }

  return {
    start(event, value) {
      if (event.pointerType === 'mouse') return
      end()
      fired = false
      origin = { x: event.clientX, y: event.clientY }
      timer = window.setTimeout(() => {
        fired = true
        open(value, event.clientX, event.clientY)
        end()
      }, 550)
    },
    move(event) {
      if (origin === null) return
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) end()
    },
    end,
    suppressClick(event) {
      if (!fired) return
      event.preventDefault()
      event.stopPropagation()
      fired = false
    },
  }
}
