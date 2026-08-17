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
  return {
    isTestDeployment,
    isLocalDeployment,
    appIconPath: isTestDeployment
      ? '/test-brand/favicon.png'
      : isLocalDeployment
        ? '/local-brand/favicon.png'
        : '/favicon.png',
    faviconPath: isTestDeployment
      ? '/test-brand/favicon.ico'
      : isLocalDeployment
        ? '/local-brand/favicon-32x32.png?v=local-green-l-1'
        : '/favicon.ico',
  }
}

export function applyEnvironmentBranding(hostname = window.location.hostname): void {
  const branding = resolveEnvironmentBranding(hostname)
  const favicon = document.querySelector<HTMLLinkElement>('#trad-favicon')
  if (favicon) {
    const replacement = favicon.cloneNode() as HTMLLinkElement
    replacement.href = branding.faviconPath
    replacement.type = branding.faviconPath.includes('.png') ? 'image/png' : 'image/x-icon'
    favicon.replaceWith(replacement)
  }
}
