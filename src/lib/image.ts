// Client-only. Shrinks a capture or upload before it is kept in memory or localStorage.
export async function imageDataUrl(file: Blob, max: number): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // WebP first; older Safari silently returns PNG for it, so fall back to JPEG. Re-encoding strips EXIF.
  let blob = await encode(canvas, 'image/webp')
  if (blob?.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg')
  if (!blob) throw new Error('blob')
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.8))
}
