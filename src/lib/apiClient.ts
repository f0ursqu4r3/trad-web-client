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
    const error = new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
    throw error
  }
  return res
}

const parseUrl = (baseUrl: string, path: string) => {
  return baseUrl.endsWith('/')
    ? `${baseUrl}${path.replace(/^\//, '')}`
    : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export async function apiGet<T = unknown>(path: string, opts: JsonOptions = {}): Promise<T> {
  const baseUrl = opts.baseUrl ?? getBaseUrl()
  const url = parseUrl(baseUrl, path)
  const res = await sessionFetch(url, { ...opts, method: 'GET' })
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
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
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
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
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

export async function apiDelete<T = unknown>(path: string, opts: JsonOptions = {}): Promise<T> {
  const baseUrl = opts.baseUrl ?? getBaseUrl()
  const url = baseUrl.endsWith('/')
    ? `${baseUrl}${path.replace(/^\//, '')}`
    : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const res = await sessionFetch(url, { ...opts, method: 'DELETE' })
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}
