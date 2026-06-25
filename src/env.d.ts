/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_API_TARGET?: string
  readonly VITE_WS_TARGET?: string
  readonly VITE_WS_URL?: string
  readonly VITE_LOG_LEVEL?: string
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string
  readonly VITE_STRIPE_PRICING_TABLE_ID?: string
  readonly VITE_STRIPE_PRICE_STARTER?: string
  readonly VITE_STRIPE_PRICE_PRO?: string
  readonly VITE_STRIPE_PRICE_ENTERPRISE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
