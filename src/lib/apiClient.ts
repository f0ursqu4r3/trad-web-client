import { getAuth0Client } from '@/plugins/auth0'

import { createLogger } from '@/lib/utils'

const logger = createLogger('api')

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

async function authFetch(input: string, init: RequestOptions = {}) {
  const auth0 = getAuth0Client() as {
    isAuthenticated?: { value?: boolean }
    getAccessTokenSilently?: (options?: Record<string, unknown>) => Promise<unknown>
  } | null

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

  // Attach bearer token when available
  try {
    if (auth0?.isAuthenticated?.value && typeof auth0.getAccessTokenSilently === 'function') {
      const token = await auth0
        .getAccessTokenSilently({
          authorizationParams: {
            audience: import.meta.env.VITE_AUTH0_AUDIENCE,
            scope: import.meta.env.VITE_AUTH0_SCOPE,
          },
        })
        .catch((error: unknown) => {
          logger.warn('Error getting access token', error)
          return null
        })
      if (typeof token === 'string' && token.length > 0) {
        headers.set('Authorization', `Bearer ${token}`)
        // Store token for WebSocket auth
        localStorage.setItem('auth_token', token)
      }
    }
  } catch (error) {
    logger.warn('Error getting access token', error)
  }

  const res = await fetch(input, { ...init, headers })
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
  const res = await authFetch(url, { ...opts, method: 'GET' })
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
  const res = await authFetch(url, init)
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
  const res = await authFetch(url, init)
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

export async function apiDelete<T = unknown>(path: string, opts: JsonOptions = {}): Promise<T> {
  const baseUrl = opts.baseUrl ?? getBaseUrl()
  const url = baseUrl.endsWith('/')
    ? `${baseUrl}${path.replace(/^\//, '')}`
    : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const res = await authFetch(url, { ...opts, method: 'DELETE' })
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}
