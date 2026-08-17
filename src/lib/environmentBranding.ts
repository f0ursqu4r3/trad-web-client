export interface EnvironmentBranding {
  isTestDeployment: boolean
  appIconPath: string
  faviconPath: string
}

export function resolveEnvironmentBranding(hostname: string): EnvironmentBranding {
  const isTestDeployment = hostname.trim().toLowerCase() === 'test.trad.lol'
  const prefix = isTestDeployment ? '/test-brand' : ''
  return {
    isTestDeployment,
    appIconPath: `${prefix}/favicon.png`,
    faviconPath: `${prefix}/favicon.ico`,
  }
}

export function applyEnvironmentBranding(hostname = window.location.hostname): void {
  const branding = resolveEnvironmentBranding(hostname)
  const favicon = document.querySelector<HTMLLinkElement>('#trad-favicon')
  if (favicon) favicon.href = branding.faviconPath
}
