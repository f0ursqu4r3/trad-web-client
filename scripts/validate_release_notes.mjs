import { access, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const releases = JSON.parse(await readFile(new URL('src/content/releases.json', root), 'utf8'))
const appPackage = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const semver = /^\d+\.\d+\.\d+$/
const date = /^\d{4}-\d{2}-\d{2}$/
const categories = ['major', 'minor', 'fixes']
const seen = new Set()

function fail(message) {
  throw new Error(`Invalid release notes: ${message}`)
}

if (!Array.isArray(releases) || releases.length === 0) fail('manifest must contain a release')

for (const [index, release] of releases.entries()) {
  if (!semver.test(release.version)) fail(`entry ${index + 1} has invalid version`)
  if (seen.has(release.version)) fail(`version ${release.version} is duplicated`)
  seen.add(release.version)

  if (!['draft', 'published'].includes(release.status)) {
    fail(`${release.version} has invalid status`)
  }
  if (release.status === 'published' && !date.test(release.released_at ?? '')) {
    fail(`${release.version} is published without a valid release date`)
  }
  if (release.status === 'draft' && release.released_at !== null) {
    fail(`${release.version} is a draft with a release date`)
  }
  if (typeof release.channel !== 'string' || release.channel.trim() === '') {
    fail(`${release.version} has no channel`)
  }
  if (typeof release.summary !== 'string' || release.summary.trim() === '') {
    fail(`${release.version} has no summary`)
  }
  for (const category of categories) {
    if (!Array.isArray(release[category])) fail(`${release.version}.${category} is not a list`)
    for (const item of release[category]) {
      if (typeof item !== 'string' || item.trim() === '') {
        fail(`${release.version}.${category} contains an empty item`)
      }
    }
  }
  if (!Array.isArray(release.details) || release.details.length === 0) {
    fail(`${release.version} has no detailed change groups`)
  }
  for (const [detailIndex, detail] of release.details.entries()) {
    if (!categories.includes(detail.category)) {
      fail(`${release.version}.details[${detailIndex}] has invalid category`)
    }
    if (typeof detail.title !== 'string' || detail.title.trim() === '') {
      fail(`${release.version}.details[${detailIndex}] has no title`)
    }
    if (!Array.isArray(detail.items) || detail.items.length === 0) {
      fail(`${release.version}.details[${detailIndex}] has no items`)
    }
    for (const item of detail.items) {
      if (typeof item !== 'string' || item.trim() === '') {
        fail(`${release.version}.details[${detailIndex}] contains an empty item`)
      }
    }
  }
  try {
    await access(new URL(`public/update-previews/${release.version}.png`, root))
  } catch {
    fail(`${release.version} has no social preview image`)
  }
}

if (!seen.has(appPackage.version)) {
  fail(`package version ${appPackage.version} has no release entry`)
}

console.log(`Validated ${releases.length} release-note entries.`)
