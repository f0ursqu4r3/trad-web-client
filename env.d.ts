/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_URL?: string
  readonly VITE_APP_BUILD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
