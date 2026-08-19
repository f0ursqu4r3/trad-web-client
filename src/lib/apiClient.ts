export interface RequestOptions extends RequestInit {
  // When true, throws on non-2xx; when false returns Response
  throwOnHTTPError?: boolean
}

export interface JsonOptions extends RequestOptions {
  // optional base URL override
  baseUrl?: string
}

function getBaseUrl() {
  // In dev, Vite proxy handles /api -> backend; in prod, use VITE_API_BASE or same origin
  return import.meta.env.VITE_API_BASE || '/api'
}

async function sessionFetch(input: string, init: RequestOptions = {}) {
  const headers = new Headers(init.headers || {})
  if (init.body && !headers.has('Content-Type')) {
    const body = init.body as unknown
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
    const isBlob = typeof Blob !== 'undefined' && body instanceof Blob
    const isArrayBuffer =
      typeof ArrayBuffer !== 'undefined' &&
      (body instanceof ArrayBuffer || ArrayBuffer.isView(body))

    if (!isFormData && !isBlob && !isArrayBuffer) {
      headers.set('Content-Type', 'application/json')
    }
  }

  const res = await fetch(input, { ...init, credentials: init.credentials ?? 'include', headers })
  if (init.throwOnHTTPError && !res.ok) {
    const text = await res.text().catch(() => '')
    const detail = readableHttpErrorDetail(text)
    const error = new Error(`HTTP ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`)
    throw error
  }
  return res
}

function readableHttpErrorDetail(text: string): string {
  if (!text.trim()) return ''
  try {
    const payload = JSON.parse(text) as unknown
    if (!payload || typeof payload !== 'object') return String(payload)
    const value = payload as Record<string, unknown>
    const messages: string[] = []
    if (typeof value.error === 'string') messages.push(value.error)
    const exchange = value.exchange_response
    if (exchange && typeof exchange === 'object') {
      const response = (exchange as Record<string, unknown>).response
      if (typeof response === 'string') messages.push(response)
    } else if (typeof exchange === 'string') {
      messages.push(exchange)
    }
    return messages.length ? messages.join(': ') : JSON.stringify(value)
  } catch {
    return text.length > 300 ? `${text.slice(0, 300)}...` : text
  }
}

const parseUrl = (baseUrl: string, path: string) => {
  return baseUrl.endsWith('/')
    ? `${baseUrl}${path.replace(/^\//, '')}`
    : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as unknown as T

  const text = await res.text()
  if (!text.trim()) {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    return undefined as unknown as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${preview}`)
  }
}

export async function apiGet<T = unknown>(path: string, opts: JsonOptions = {}): Promise<T> {
  const baseUrl = opts.baseUrl ?? getBaseUrl()
  const url = parseUrl(baseUrl, path)
  const res = await sessionFetch(url, { ...opts, method: 'GET' })
  return parseJsonResponse<T>(res)
}

export async function apiPost<T = unknown, B = unknown>(
  path: string,
  body?: B,
  opts: JsonOptions = {},
): Promise<T> {
  const baseUrl = opts.baseUrl ?? getBaseUrl()
  const url = parseUrl(baseUrl, path)
  const init: RequestOptions = {
    ...opts,
    method: 'POST',
    body: body != null ? JSON.stringify(body) : undefined,
  }
  const res = await sessionFetch(url, init)
  return parseJsonResponse<T>(res)
}

export async function apiPut<T = unknown, B = unknown>(
  path: string,
  body?: B,
  opts: JsonOptions = {},
): Promise<T> {
  const baseUrl = opts.baseUrl ?? getBaseUrl()
  const url = parseUrl(baseUrl, path)
  const init: RequestOptions = {
    ...opts,
    method: 'PUT',
    body: body != null ? JSON.stringify(body) : undefined,
  }
  const res = await sessionFetch(url, init)
  return parseJsonResponse<T>(res)
}

export async function apiDelete<T = unknown>(path: string, opts: JsonOptions = {}): Promise<T> {
  const baseUrl = opts.baseUrl ?? getBaseUrl()
  const url = baseUrl.endsWith('/')
    ? `${baseUrl}${path.replace(/^\//, '')}`
    : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const res = await sessionFetch(url, { ...opts, method: 'DELETE' })
  return parseJsonResponse<T>(res)
}
