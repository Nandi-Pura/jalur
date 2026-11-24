import type { Rect } from '../model/types'

const PAD = 32

/** Serialises what the canvas draws (minus selection and handles) as a standalone SVG. */
export function buildSvg(bounds: Rect, background: string | null = '#ffffff'): string {
  const world = document.querySelector('[data-world]')
  if (!world) throw new Error('Nothing to export')
  const clone = world.cloneNode(true) as SVGGElement
  clone.querySelectorAll('[data-export="ignore"]').forEach((n) => n.remove())
  clone.removeAttribute('transform')
  clone.querySelectorAll('*').forEach((n) => {
    for (const attr of [...n.attributes]) if (attr.name.startsWith('data-') || attr.name === 'style') n.removeAttribute(attr.name)
  })
  const x = bounds.x - PAD
  const y = bounds.y - PAD
  const w = bounds.w + PAD * 2
  const h = bounds.h + PAD * 2
  const body = new XMLSerializer().serializeToString(clone).replace(' xmlns="http://www.w3.org/2000/svg"', '')
  const bg = background ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${background}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${bg}${body}</svg>`
}

export function svgToPng(svg: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(img.width * scale)
      canvas.height = Math.ceil(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not render the SVG'))
    }
    img.src = url
  })
}
