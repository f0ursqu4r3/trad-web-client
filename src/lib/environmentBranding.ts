export interface EnvironmentBranding {
  isTestDeployment: boolean
  isLocalDeployment: boolean
  appIconPath: string
  faviconPath: string
}

export function resolveEnvironmentBranding(hostname: string): EnvironmentBranding {
  const normalizedHostname = hostname.trim().toLowerCase()
  const isTestDeployment = normalizedHostname === 'test.trad.lol'
  const isLocalDeployment = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'].includes(
    normalizedHostname,
  )
  const prefix = isTestDeployment ? '/test-brand' : isLocalDeployment ? '/local-brand' : ''
  return {
    isTestDeployment,
    isLocalDeployment,
    appIconPath: `${prefix}/favicon.png`,
    faviconPath: `${prefix}/favicon.ico`,
  }
}

export function applyEnvironmentBranding(hostname = window.location.hostname): void {
  const branding = resolveEnvironmentBranding(hostname)
  const favicon = document.querySelector<HTMLLinkElement>('#trad-favicon')
  if (favicon) favicon.href = branding.faviconPath
}
