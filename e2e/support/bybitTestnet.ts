import { createHmac } from 'node:crypto'
import type { APIRequestContext } from '@playwright/test'

const baseUrl = 'https://api-testnet.bybit.com'
const receiveWindow = '5000'

export interface BybitPosition {
  leverage: string
  positionIdx: number
  side: '' | 'Buy' | 'Sell'
  size: string
  symbol: string
}

export interface BybitOpenOrder {
  orderId: string
  orderLinkId: string
  orderStatus: string
  orderType: string
  positionIdx: number
  price: string
  reduceOnly: boolean
  side: 'Buy' | 'Sell'
  stopOrderType: string
  symbol: string
  triggerPrice: string
}

export interface BybitAccountInfo {
  marginMode: 'ISOLATED_MARGIN' | 'REGULAR_MARGIN' | 'PORTFOLIO_MARGIN'
  unifiedMarginStatus: number
}

export interface BybitSymbolState {
  longQuantity: number
  shortQuantity: number
  positions: BybitPosition[]
  openOrders: BybitOpenOrder[]
}

export interface BybitInstrument {
  lastPrice: number
  minimumNotional: number
  quantityStep: number
  tickSize: number
}

interface BybitResponse<T> {
  retCode: number
  retMsg: string
  result: T
}

export async function bybitLastPrice(request: APIRequestContext, symbol: string): Promise<number> {
  const response = await request.get(`${baseUrl}/v5/market/tickers`, {
    params: { category: 'linear', symbol },
  })
  if (!response.ok()) throw new Error(`Bybit ticker query failed: HTTP ${response.status()}`)
  const payload = (await response.json()) as BybitResponse<{
    list?: Array<{ lastPrice?: string; symbol?: string }>
  }>
  assertBybitSuccess(payload, 'ticker query')
  const price = Number(payload.result.list?.find((item) => item.symbol === symbol)?.lastPrice)
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Bybit ticker query omitted a valid ${symbol} price`)
  }
  return price
}

export async function bybitInstrument(
  request: APIRequestContext,
  symbol: string,
): Promise<BybitInstrument> {
  const [lastPrice, response] = await Promise.all([
    bybitLastPrice(request, symbol),
    request.get(`${baseUrl}/v5/market/instruments-info`, {
      params: { category: 'linear', symbol },
    }),
  ])
  if (!response.ok()) {
    throw new Error(`Bybit instrument query failed: HTTP ${response.status()}`)
  }
  const payload = (await response.json()) as BybitResponse<{
    list?: Array<{
      lotSizeFilter?: { minNotionalValue?: string; qtyStep?: string }
      priceFilter?: { tickSize?: string }
      symbol?: string
    }>
  }>
  assertBybitSuccess(payload, 'instrument query')
  const instrument = payload.result.list?.find((item) => item.symbol === symbol)
  const minimumNotional = Number(instrument?.lotSizeFilter?.minNotionalValue)
  const quantityStep = Number(instrument?.lotSizeFilter?.qtyStep)
  const tickSize = Number(instrument?.priceFilter?.tickSize)
  if (
    !Number.isFinite(minimumNotional) ||
    minimumNotional <= 0 ||
    !Number.isFinite(quantityStep) ||
    quantityStep <= 0 ||
    !Number.isFinite(tickSize) ||
    tickSize <= 0
  ) {
    throw new Error(`Bybit instrument query omitted valid ${symbol} trading rules`)
  }
  return { lastPrice, minimumNotional, quantityStep, tickSize }
}

export async function bybitSymbolState(
  request: APIRequestContext,
  credentials: { apiKey: string; apiSecret: string },
  symbol: string,
): Promise<BybitSymbolState> {
  const [positionPayload, orderPayload] = await Promise.all([
    signedGet<{ list?: BybitPosition[] }>(request, credentials, '/v5/position/list', {
      category: 'linear',
      symbol,
    }),
    signedGet<{ list?: BybitOpenOrder[] }>(request, credentials, '/v5/order/realtime', {
      category: 'linear',
      symbol,
      openOnly: '0',
      limit: '50',
    }),
  ])
  const positions = positionPayload.list ?? []
  const openOrders = orderPayload.list ?? []
  return {
    longQuantity: sideQuantity(positions, 'Buy'),
    shortQuantity: sideQuantity(positions, 'Sell'),
    positions,
    openOrders,
  }
}

export async function bybitAccountInfo(
  request: APIRequestContext,
  credentials: { apiKey: string; apiSecret: string },
): Promise<BybitAccountInfo> {
  return await signedGet<BybitAccountInfo>(request, credentials, '/v5/account/info', {})
}

async function signedGet<T>(
  request: APIRequestContext,
  credentials: { apiKey: string; apiSecret: string },
  path: string,
  parameters: Record<string, string>,
): Promise<T> {
  const query = new URLSearchParams(parameters).toString()
  const timestamp = Date.now().toString()
  const payload = `${timestamp}${credentials.apiKey}${receiveWindow}${query}`
  const signature = createHmac('sha256', credentials.apiSecret).update(payload).digest('hex')
  const response = await request.get(`${baseUrl}${path}?${query}`, {
    headers: {
      'X-BAPI-API-KEY': credentials.apiKey,
      'X-BAPI-RECV-WINDOW': receiveWindow,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
    },
  })
  if (!response.ok())
    throw new Error(`Bybit signed query failed: ${path} HTTP ${response.status()}`)
  const result = (await response.json()) as BybitResponse<T>
  assertBybitSuccess(result, path)
  return result.result
}

function sideQuantity(positions: BybitPosition[], side: 'Buy' | 'Sell'): number {
  return positions
    .filter((position) => position.side === side)
    .reduce((total, position) => total + Number(position.size || 0), 0)
}

function assertBybitSuccess(payload: BybitResponse<unknown>, operation: string): void {
  if (payload.retCode !== 0) {
    throw new Error(`Bybit ${operation} failed: ${payload.retCode} ${payload.retMsg}`)
  }
}
