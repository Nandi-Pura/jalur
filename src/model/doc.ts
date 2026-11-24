import { containsPoint, center } from './geometry'
import { newId } from './ids'
import type { DiagramDoc, Page, Point, Zone } from './types'

export function emptyPage(name: string): Page {
  return { id: newId('page'), name, devices: [], zones: [], links: [], showLegend: true, legend: { x: 40, y: 40 } }
}

export function emptyDoc(title = 'Untitled diagram'): DiagramDoc {
  const page = emptyPage('Page 1')
  return { format: 'jalur', version: 1, title, pages: [page], activePageId: page.id }
}

export function activePage(doc: DiagramDoc): Page {
  return doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0]
}

export function updateActivePage(doc: DiagramDoc, fn: (page: Page) => Page): DiagramDoc {
  const current = activePage(doc)
  const next = fn(current)
  if (next === current) return doc
  return { ...doc, pages: doc.pages.map((p) => (p.id === current.id ? next : p)) }
}

/** The smallest zone containing the point; zones nest by size. */
export function zoneAt(zones: Zone[], p: Point, excludeId?: string): Zone | null {
  let best: Zone | null = null
  for (const z of zones) {
    if (z.id === excludeId || !containsPoint(z, p)) continue
    if (!best || z.w * z.h < best.w * best.h) best = z
  }
  return best
}

/** Re-derives zone membership of the given devices from where their centres sit. */
export function assignZones(page: Page, deviceIds?: Set<string>): Page {
  let changed = false
  const devices = page.devices.map((d) => {
    if (deviceIds && !deviceIds.has(d.id)) return d
    const zoneId = zoneAt(page.zones, center(d))?.id ?? null
    if (zoneId === d.zoneId) return d
    changed = true
    return { ...d, zoneId }
  })
  return changed ? { ...page, devices } : page
}

export function uniquePageName(doc: DiagramDoc): string {
  const names = new Set(doc.pages.map((p) => p.name))
  let i = doc.pages.length + 1
  while (names.has(`Page ${i}`)) i++
  return `Page ${i}`
}
