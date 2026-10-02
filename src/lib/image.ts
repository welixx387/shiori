/** Уменьшает картинку до заданного размера и возвращает JPEG/WebP Blob. */
export async function resizeImage(
  file: Blob,
  opts: { maxWidth: number; maxHeight: number; square?: boolean; quality?: number }
): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Не удалось прочитать изображение'))
      el.src = url
    })
    let sx = 0
    let sy = 0
    let sw = img.naturalWidth
    let sh = img.naturalHeight
    if (opts.square) {
      const side = Math.min(sw, sh)
      sx = (sw - side) / 2
      sy = (sh - side) / 2
      sw = sh = side
    }
    const scale = Math.min(1, opts.maxWidth / sw, opts.maxHeight / sh)
    const w = Math.round(sw * scale)
    const h = Math.round(sh * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', opts.quality ?? 0.86)
    )
    if (blob && blob.type === 'image/webp') return blob
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Не удалось сжать изображение'))),
        'image/jpeg',
        opts.quality ?? 0.86
      )
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
