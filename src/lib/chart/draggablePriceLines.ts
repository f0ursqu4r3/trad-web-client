import type {
  CreatePriceLineOptions,
  IPriceLine,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveBase,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'

interface InternalLineState {
  definition: DraggablePriceLineDefinition
  priceLine: IPriceLine
}

interface DraggingState {
  id: string
  pointerId: number
  grabOffset: number
  startCoordinate: number
  started: boolean
  moved: boolean
}

interface PointerHitCandidate {
  id: string
  pointerId: number
}

interface LineHit {
  id: string
  distance: number
  draggable: boolean
}

export interface DraggablePriceLineDefinition {
  id: string
  options: CreatePriceLineOptions
  draggable?: boolean
}

export interface DraggablePriceLineDragEvent {
  id: string
  price: number
  options: CreatePriceLineOptions
  originalEvent: PointerEvent
}

export interface DraggablePriceLinesPluginOptions {
  lines?: DraggablePriceLineDefinition[]
  hitTestPadding?: number
  onDragStart?: (event: DraggablePriceLineDragEvent) => void
  onDrag?: (event: DraggablePriceLineDragEvent) => void
  onDragEnd?: (event: DraggablePriceLineDragEvent) => void
  onClick?: (event: DraggablePriceLineDragEvent) => void
  onDblClick?: (event: DraggablePriceLineDragEvent) => void
}

export interface DraggablePriceLinesPluginApi {
  setLines(lines: DraggablePriceLineDefinition[]): void
  updateLine(id: string, options: CreatePriceLineOptions): void
  setLineDraggable(id: string, draggable: boolean): void
  destroy(): void
}

const DEFAULT_HIT_PADDING = 6
const DOUBLE_CLICK_DELAY_MS = 200
const DRAG_START_THRESHOLD = 2

class DraggablePriceLinesPrimitive<HorzScaleItem, TSeriesType extends SeriesType>
  implements ISeriesPrimitiveBase<SeriesAttachedParameter<HorzScaleItem, TSeriesType>>
{
  private readonly eventOptions: Omit<DraggablePriceLinesPluginOptions, 'lines'>
  private readonly initialLines: DraggablePriceLineDefinition[]
  private readonly lines = new Map<string, InternalLineState>()
  private pendingLines: DraggablePriceLineDefinition[] | null = null
  private series: ISeriesApi<TSeriesType, HorzScaleItem> | null = null
  private chartElement: HTMLDivElement | null = null
  private dragging: DraggingState | null = null
  private pointerHit: PointerHitCandidate | null = null
  private lastClick: { id: string; time: number } | null = null
  private pendingClick: DraggablePriceLineDragEvent | null = null
  private clickTimeout: ReturnType<typeof setTimeout> | null = null
  private hoveredId: string | null = null
  private isAttached = false

  constructor(options: DraggablePriceLinesPluginOptions = {}) {
    const { lines = [], ...rest } = options
    this.initialLines = [...lines]
    this.eventOptions = rest
  }

  attached(param: SeriesAttachedParameter<HorzScaleItem, TSeriesType>): void {
    this.series = param.series
    this.chartElement = param.chart.chartElement()
    this.installEventListeners()
    this.isAttached = true
    const toApply = this.pendingLines ?? this.initialLines
    if (toApply.length) {
      this.setLines(toApply)
    }
    this.pendingLines = null
  }

  detached(): void {
    this.cancelActiveDrag()
    this.removeAllLines()
    this.teardownEventListeners()
    this.series = null
    this.chartElement = null
    this.dragging = null
    this.hoveredId = null
    this.cancelPendingClick()
    this.isAttached = false
  }

  setLines(lines: DraggablePriceLineDefinition[]): void {
    if (!this.series) {
      this.pendingLines = lines.map(cloneLineDefinition)
      return
    }
    const nextIds = new Set<string>()

    for (const def of lines) {
      const normalized = cloneLineDefinition(def)
      nextIds.add(normalized.id)
      const existing = this.lines.get(normalized.id)
      if (existing) {
        existing.definition = normalized
        existing.priceLine.applyOptions(normalized.options)
        continue
      }
      const priceLine = this.series.createPriceLine(normalized.options)
      this.lines.set(normalized.id, {
        definition: normalized,
        priceLine,
      })
    }

    for (const [id, state] of Array.from(this.lines.entries())) {
      if (!nextIds.has(id) && this.series) {
        this.series.removePriceLine(state.priceLine)
        this.lines.delete(id)
      }
    }
  }

  updateLine(id: string, options: CreatePriceLineOptions): void {
    const state = this.lines.get(id)
    if (!state || !this.series) return
    state.definition = cloneLineDefinition({ id, options, draggable: state.definition.draggable })
    state.priceLine.applyOptions(state.definition.options)
  }

  setLineDraggable(id: string, draggable: boolean): void {
    const state = this.lines.get(id)
    if (!state) return
    if (state.definition.draggable === draggable) return

    state.definition = {
      ...state.definition,
      draggable,
    }

    if (!draggable) {
      this.cancelActiveDrag(id)
      if (this.hoveredId === id) {
        this.setCursor('not-allowed')
      }
      if (this.pointerHit?.id === id) {
        this.pointerHit = null
      }
    } else if (this.hoveredId === id) {
      this.setCursor('ns-resize')
    }
  }

  destroy(): void {
    if (this.series && this.isAttached) {
      try {
        this.series.detachPrimitive(this as unknown as ISeriesPrimitive<HorzScaleItem>)
      } catch {
        // ignore detach errors, fallback to manual cleanup
      }
    } else {
      this.removeAllLines()
      this.teardownEventListeners()
    }
    this.cancelPendingClick()
  }

  private removeAllLines(): void {
    if (!this.series) {
      this.lines.clear()
      return
    }
    for (const { priceLine } of this.lines.values()) {
      this.series.removePriceLine(priceLine)
    }
    this.lines.clear()
  }

  private installEventListeners(): void {
    if (!this.chartElement) return
    this.chartElement.addEventListener('pointerdown', this.onPointerDown, { passive: false })
    this.chartElement.addEventListener('pointermove', this.onPointerMove, { passive: false })
    this.chartElement.addEventListener('pointerup', this.onPointerUp)
    this.chartElement.addEventListener('pointercancel', this.onPointerUp)
    this.chartElement.addEventListener('pointerleave', this.onPointerLeave)
  }

  private teardownEventListeners(): void {
    if (!this.chartElement) return
    this.chartElement.removeEventListener('pointerdown', this.onPointerDown)
    this.chartElement.removeEventListener('pointermove', this.onPointerMove)
    this.chartElement.removeEventListener('pointerup', this.onPointerUp)
    this.chartElement.removeEventListener('pointercancel', this.onPointerUp)
    this.chartElement.removeEventListener('pointerleave', this.onPointerLeave)
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.series || !this.chartElement) return
    const paneY = this.toPaneY(event)
    if (paneY == null) return

    this.pointerHit = null

    const hit = this.findClosestLine(paneY)
    if (!hit) return

    const state = this.lines.get(hit.id)
    if (!state) return

    this.pointerHit = { id: hit.id, pointerId: event.pointerId }

    if (!hit.draggable) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const coordinate = this.series.priceToCoordinate(state.definition.options.price)
    if (coordinate == null) return

    this.dragging = {
      id: hit.id,
      pointerId: event.pointerId,
      grabOffset: coordinate - paneY,
      startCoordinate: coordinate,
      started: false,
      moved: false,
    }

    this.setCursor('ns-resize')

    if (this.chartElement.setPointerCapture) {
      try {
        this.chartElement.setPointerCapture(event.pointerId)
      } catch {
        // Ignore browsers that throw when pointer capture is not supported
      }
    }
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.series || !this.chartElement) return
    const paneY = this.toPaneY(event)
    if (paneY == null) {
      if (!this.dragging) {
        this.resetCursor()
      }
      return
    }

    if (this.dragging) {
      if (event.pointerId !== this.dragging.pointerId) return
      const targetCoordinate = paneY + this.dragging.grabOffset
      const delta = Math.abs(targetCoordinate - this.dragging.startCoordinate)
      if (!this.dragging.started) {
        if (delta <= DRAG_START_THRESHOLD) {
          return
        }

        this.dragging.started = true
        this.dragging.moved = true

        const state = this.lines.get(this.dragging.id)
        if (state) {
          this.eventOptions.onDragStart?.({
            id: this.dragging.id,
            price: state.definition.options.price,
            options: cloneOptions(state.definition.options),
            originalEvent: event,
          })
        }
      }

      if (!this.dragging.moved && delta > DRAG_START_THRESHOLD) {
        this.dragging.moved = true
      }
      const price = this.series.coordinateToPrice(targetCoordinate)
      if (price == null || Number.isNaN(price)) return
      this.applyDragPrice(this.dragging.id, price, event)
      return
    }

    const hit = this.findClosestLine(paneY)
    const hitId = hit?.id ?? null
    if (hitId !== this.hoveredId) {
      this.hoveredId = hitId
      if (hit) {
        this.setCursor(hit.draggable ? 'ns-resize' : 'not-allowed')
      } else {
        this.setCursor(null)
      }
    }
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    const paneY = this.toPaneY(event)
    let clickCandidateId: string | null = null

    if (this.dragging && event.pointerId === this.dragging.pointerId) {
      const wasStarted = this.dragging.started
      const state = this.lines.get(this.dragging.id)
      if (state && wasStarted) {
        this.eventOptions.onDragEnd?.({
          id: this.dragging.id,
          price: state.definition.options.price,
          options: cloneOptions(state.definition.options),
          originalEvent: event,
        })
      }

      if (!wasStarted) {
        clickCandidateId = this.dragging.id
      }

      if (this.chartElement?.releasePointerCapture) {
        try {
          this.chartElement.releasePointerCapture(event.pointerId)
        } catch {
          // ignore
        }
      }

      this.dragging = null
    } else if (this.pointerHit && this.pointerHit.pointerId === event.pointerId) {
      clickCandidateId = this.pointerHit.id
    }

    this.pointerHit = null
    this.resetCursor()

    if (!clickCandidateId || paneY == null) {
      return
    }

    if (this.isWithinHitRange(clickCandidateId, paneY)) {
      this.handleClick(clickCandidateId, event)
    }
  }

  private readonly onPointerLeave = () => {
    if (!this.dragging) {
      this.hoveredId = null
      this.resetCursor()
    }
    this.pointerHit = null
  }

  private applyDragPrice(id: string, price: number, event: PointerEvent): void {
    const state = this.lines.get(id)
    if (!state || !this.series) return

    // Clamp price to finite values only
    if (!Number.isFinite(price)) return

    if (state.definition.options.price === price) return

    state.definition = {
      ...state.definition,
      options: {
        ...state.definition.options,
        price,
      },
    }
    state.priceLine.applyOptions({ ...state.definition.options, price })

    if (this.dragging && this.dragging.id === id) {
      this.dragging.moved = true
    }

    if (this.dragging?.started) {
      this.eventOptions.onDrag?.({
        id,
        price,
        options: cloneOptions(state.definition.options),
        originalEvent: event,
      })
    }
  }

  private toPaneY(event: PointerEvent): number | null {
    if (!this.chartElement) return null
    const rect = this.chartElement.getBoundingClientRect()
    const y = event.clientY - rect.top
    if (y < 0 || y > rect.height) return null
    return y
  }

  private findClosestLine(paneY: number): LineHit | null {
    if (!this.series) return null
    let closest: LineHit | null = null
    const threshold = this.eventOptions.hitTestPadding ?? DEFAULT_HIT_PADDING
    for (const [id, state] of this.lines) {
      const coordinate = this.series.priceToCoordinate(state.definition.options.price)
      if (coordinate == null) continue
      const distance = Math.abs(coordinate - paneY)
      if (distance <= threshold && (!closest || distance < closest.distance)) {
        closest = {
          id,
          distance,
          draggable: state.definition.draggable !== false,
        }
      }
    }
    return closest
  }

  private isWithinHitRange(id: string, paneY: number): boolean {
    const hit = this.findClosestLine(paneY)
    return Boolean(hit && hit.id === id)
  }

  private handleClick(id: string, event: PointerEvent): void {
    const state = this.lines.get(id)
    if (!state) return

    const payload: DraggablePriceLineDragEvent = {
      id,
      price: state.definition.options.price,
      options: cloneOptions(state.definition.options),
      originalEvent: event,
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()

    if (
      this.lastClick &&
      this.lastClick.id === id &&
      now - this.lastClick.time <= DOUBLE_CLICK_DELAY_MS
    ) {
      this.cancelPendingClick()
      this.eventOptions.onDblClick?.(payload)
      this.lastClick = null
      return
    }

    this.flushPendingClick()

    this.pendingClick = payload
    this.clickTimeout = setTimeout(() => {
      const pending = this.pendingClick
      this.cancelPendingClick()
      if (pending) {
        this.eventOptions.onClick?.(pending)
      }
      this.lastClick = null
    }, DOUBLE_CLICK_DELAY_MS)

    this.lastClick = { id, time: now }
  }

  private flushPendingClick(): void {
    if (!this.pendingClick) return
    const pending = this.pendingClick
    this.cancelPendingClick()
    this.eventOptions.onClick?.(pending)
    this.lastClick = null
  }

  private cancelPendingClick(): void {
    if (this.clickTimeout != null) {
      clearTimeout(this.clickTimeout)
      this.clickTimeout = null
    }
    this.pendingClick = null
  }

  private cancelActiveDrag(id?: string): void {
    if (!this.dragging) return
    if (id && this.dragging.id !== id) return

    if (this.chartElement?.releasePointerCapture) {
      try {
        this.chartElement.releasePointerCapture(this.dragging.pointerId)
      } catch {
        // ignore browsers that throw when pointer capture is not supported
      }
    }

    this.dragging = null
    this.pointerHit = null
    this.resetCursor()
  }

  private setCursor(cursor: string | null): void {
    if (!this.chartElement) return
    this.chartElement.style.cursor = cursor ?? ''
  }

  private resetCursor(): void {
    if (!this.chartElement) return
    this.chartElement.style.cursor = ''
  }
}

function cloneLineDefinition(def: DraggablePriceLineDefinition): DraggablePriceLineDefinition {
  return {
    id: def.id,
    draggable: def.draggable ?? true,
    options: cloneOptions(def.options),
  }
}

function cloneOptions<T extends CreatePriceLineOptions>(options: T): T {
  return { ...options }
}

export function createDraggablePriceLinesPlugin<
  HorzScaleItem = Time,
  TSeries extends SeriesType = SeriesType,
>(
  series: ISeriesApi<TSeries, HorzScaleItem>,
  options: DraggablePriceLinesPluginOptions = {},
): DraggablePriceLinesPluginApi {
  const primitive = new DraggablePriceLinesPrimitive<HorzScaleItem, TSeries>(
    options as DraggablePriceLinesPluginOptions,
  )
  series.attachPrimitive(primitive as unknown as ISeriesPrimitive<HorzScaleItem>)

  return {
    setLines: (lines) => primitive.setLines(lines),
    updateLine: (id, lineOptions) => primitive.updateLine(id, lineOptions),
    setLineDraggable: (id, draggable) => primitive.setLineDraggable(id, draggable),
    destroy: () => {
      primitive.destroy()
    },
  }
}
