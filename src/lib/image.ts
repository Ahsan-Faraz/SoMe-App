// Client-only. Shrinks a capture or upload on the phone before it is uploaded or kept in memory.

export type ResizedImage = { blob: Blob; width: number; height: number }

// Longest side at most `max` px, as WebP (JPEG 0.8 on browsers that can't encode WebP).
// Re-encoding strips EXIF, including the location.
export async function resizeImage(file: Blob, max: number): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // Older Safari silently returns PNG for WebP: fall back to JPEG.
  let blob = await encode(canvas, 'image/webp')
  if (blob?.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg')
  if (!blob) throw new Error('blob')
  return { blob, width: canvas.width, height: canvas.height }
}

export async function imageDataUrl(file: Blob, max: number): Promise<string> {
  return blobDataUrl((await resizeImage(file, max)).blob)
}

export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.8))
}
