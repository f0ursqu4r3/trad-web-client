const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SOURCE_BYTES = 5 * 1024 * 1024
const MAX_STORED_CHARACTERS = 180_000
const PROFILE_IMAGE_EDGE = 160

export function normalizeProfileImage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_STORED_CHARACTERS) return null
  return /^data:image\/(?:jpeg|png|webp);base64,/i.test(value) ? value : null
}

function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

export async function prepareProfileImage(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Choose a PNG, JPEG, or WebP image.')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('Choose an image smaller than 5 MB.')
  }

  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = PROFILE_IMAGE_EDGE
  canvas.height = PROFILE_IMAGE_EDGE
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('This browser could not prepare the image.')
  }

  const sourceEdge = Math.min(bitmap.width, bitmap.height)
  const sourceX = (bitmap.width - sourceEdge) / 2
  const sourceY = (bitmap.height - sourceEdge) / 2
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceEdge,
    sourceEdge,
    0,
    0,
    PROFILE_IMAGE_EDGE,
    PROFILE_IMAGE_EDGE,
  )
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.82),
  )
  if (!blob) throw new Error('This browser could not prepare the image.')

  const dataUrl = await blobAsDataUrl(blob)
  if (!normalizeProfileImage(dataUrl)) throw new Error('The prepared image is too large.')
  return dataUrl
}
