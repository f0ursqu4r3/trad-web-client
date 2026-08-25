import { mkdir, readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const dist = new URL('dist/', root)
const template = await readFile(new URL('index.html', dist), 'utf8')
const releases = JSON.parse(await readFile(new URL('src/content/releases.json', root), 'utf8'))
const configuredOrigin = process.env.TRAD_PUBLIC_ORIGIN?.trim()
const existingUrl = template.match(/<meta\s+property="og:url"\s+content="([^"]+)"\s*\/?>/)?.[1]
const publicOrigin = (configuredOrigin || (existingUrl ? new URL(existingUrl).origin : '')).replace(
  /\/$/,
  '',
)

if (!publicOrigin) throw new Error('TRAD_PUBLIC_ORIGIN or an existing og:url is required')

const publicHostname = new URL(publicOrigin).hostname.toLowerCase()
const productionDeployment = publicHostname === 'trad.lol' || publicHostname === 'www.trad.lol'
const previewDirectory = productionDeployment ? 'prod-update-previews' : 'update-previews'
const publishedReleases = releases.filter((entry) => entry.status === 'published')
const currentRelease = publishedReleases[0]

if (!currentRelease) throw new Error('At least one published release is required')

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function replaceMeta(html, attribute, key, content) {
  const matcher = new RegExp(`<meta(?=[^>]*\\b${attribute}="${key}")[^>]*>`, 'i')
  const replacement = `<meta ${attribute}="${key}" content="${escapeAttribute(content)}" />`
  if (matcher.test(html)) return html.replace(matcher, replacement)
  return html.replace('</head>', `    ${replacement}\n  </head>`)
}

function releaseHtml({ title, description, url, image, imageAlt }) {
  let html = template.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttribute(title)}</title>`)
  html = replaceMeta(html, 'name', 'description', description)
  html = replaceMeta(html, 'property', 'og:type', 'article')
  html = replaceMeta(html, 'property', 'og:title', title)
  html = replaceMeta(html, 'property', 'og:description', description)
  html = replaceMeta(html, 'property', 'og:url', url)
  html = replaceMeta(html, 'property', 'og:image', image)
  html = replaceMeta(html, 'property', 'og:image:alt', imageAlt)
  html = replaceMeta(html, 'name', 'twitter:title', title)
  html = replaceMeta(html, 'name', 'twitter:description', description)
  html = replaceMeta(html, 'name', 'twitter:image', image)
  html = replaceMeta(html, 'name', 'twitter:image:alt', imageAlt)
  const canonical = `<link rel="canonical" href="${escapeAttribute(url)}" />`
  return html.replace('</head>', `    ${canonical}\n  </head>`)
}

function siteHtml() {
  const title = productionDeployment
    ? 'TRAD — Trading Terminal'
    : 'TRAD TEST — Trading Terminal'
  const socialTitle = productionDeployment
    ? 'TRAD — Managed Trading Workspace'
    : 'TRAD TEST — Mainnet Trading Workspace'
  const description = productionDeployment
    ? 'TRAD managed trading and execution workspace.'
    : 'Test the latest TRAD managed-trading workspace on Hyperliquid Mainnet.'
  const image = productionDeployment
    ? `${publicOrigin}/${previewDirectory}/${currentRelease.version}.png`
    : `${publicOrigin}/test-brand/social-preview.png`
  const imageAlt = productionDeployment
    ? 'TRAD managed-trading workspace'
    : 'TRAD TEST logo beside the managed-trades workspace'

  let html = template.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttribute(title)}</title>`)
  html = replaceMeta(html, 'name', 'description', description)
  html = replaceMeta(html, 'property', 'og:title', socialTitle)
  html = replaceMeta(html, 'property', 'og:description', description)
  html = replaceMeta(html, 'property', 'og:url', `${publicOrigin}/`)
  html = replaceMeta(html, 'property', 'og:image', image)
  html = replaceMeta(html, 'property', 'og:image:alt', imageAlt)
  html = replaceMeta(html, 'name', 'twitter:title', socialTitle)
  html = replaceMeta(html, 'name', 'twitter:description', description)
  html = replaceMeta(html, 'name', 'twitter:image', image)
  html = replaceMeta(html, 'name', 'twitter:image:alt', imageAlt)
  return html
}

await writeFile(new URL('index.html', dist), siteHtml())

const updatesUrl = `${publicOrigin}/updates/`
await mkdir(new URL('updates/', dist), { recursive: true })
await writeFile(
  new URL('updates/index.html', dist),
  releaseHtml({
    title: 'Trad updates — Patch notes',
    description: 'Detailed Trad releases, improvements, and fixes.',
    url: updatesUrl,
    image: productionDeployment
      ? `${publicOrigin}/${previewDirectory}/${currentRelease.version}.png`
      : `${publicOrigin}/test-brand/social-preview.png`,
    imageAlt: 'Trad managed-trading workspace updates',
  }),
)

let generated = 0
for (const release of publishedReleases) {
  const directory = new URL(`updates/${release.version}/`, dist)
  const url = `${publicOrigin}/updates/${release.version}/`
  await mkdir(directory, { recursive: true })
  await writeFile(
    new URL('index.html', directory),
    releaseHtml({
      title: `Trad ${release.version} — Patch notes`,
      description: release.summary,
      url,
      image: `${publicOrigin}/${previewDirectory}/${release.version}.png`,
      imageAlt: `Trad ${release.version} release preview`,
    }),
  )
  generated += 1
}

console.log(`Generated ${generated} published release pages for ${publicOrigin}.`)
