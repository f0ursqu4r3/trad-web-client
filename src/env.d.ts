/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH0_DOMAIN: string
  readonly VITE_AUTH0_CLIENT_ID: string
  readonly VITE_AUTH0_AUDIENCE?: string
  readonly VITE_AUTH0_SCOPE?: string
  readonly VITE_API_BASE?: string
  readonly VITE_API_TARGET?: string
  readonly VITE_GATEWAY_URL?: string
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string
  readonly VITE_STRIPE_PRICING_TABLE_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
