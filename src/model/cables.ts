import { linkTypeSpec, speedName } from './linkStyles'
import type { DiagramDoc, Page } from './types'

export interface CableRow {
  pageId: string
  page: string
  id: string
  cable: string
  from: string
  fromPort: string
  fromZone: string
  to: string
  toPort: string
  toZone: string
  type: string
  speed: string
  label: string
}

/** Cables are numbered per page in drawing order: C001, C002… */
export function cableRows(page: Page): CableRow[] {
  const devices = new Map(page.devices.map((d) => [d.id, d]))
  const zones = new Map(page.zones.map((z) => [z.id, z.label]))
  const name = (id: string) => devices.get(id)?.label || '?'
  const zone = (id: string) => zones.get(devices.get(id)?.zoneId ?? '') ?? ''
  return page.links.map((l, i) => ({
    pageId: page.id,
    page: page.name,
    id: l.id,
    cable: `C${String(i + 1).padStart(3, '0')}`,
    from: name(l.source.nodeId),
    fromPort: l.source.port,
    fromZone: zone(l.source.nodeId),
    to: name(l.target.nodeId),
    toPort: l.target.port,
    toZone: zone(l.target.nodeId),
    type: linkTypeSpec(l.type).name,
    speed: l.speed ? speedName(l.speed) : '',
    label: l.label,
  }))
}

export const docCableRows = (doc: DiagramDoc): CableRow[] => doc.pages.flatMap(cableRows)

const COLUMNS: [keyof CableRow, string][] = [
  ['page', 'Page'],
  ['cable', 'Cable'],
  ['from', 'From'],
  ['fromPort', 'From port'],
  ['fromZone', 'From zone'],
  ['to', 'To'],
  ['toPort', 'To port'],
  ['toZone', 'To zone'],
  ['type', 'Type'],
  ['speed', 'Speed'],
  ['label', 'Label'],
]

const cell = (v: string): string => {
  // Spreadsheets run cells starting with these as formulas.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function cablesCsv(rows: CableRow[]): string {
  const lines = [COLUMNS.map(([, h]) => h), ...rows.map((r) => COLUMNS.map(([k]) => r[k]))]
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n'
}

export interface Trace {
  deviceIds: string[]
  linkIds: string[]
}

/** Fewest-cable path between two devices on a page, or null when they aren't connected. */
export function tracePath(page: Page, from: string, to: string): Trace | null {
  const prev = new Map<string, { node: string; link: string } | null>([[from, null]])
  const queue = [from]
  while (queue.length) {
    const node = queue.shift()!
    if (node === to) break
    for (const l of page.links) {
      const next = l.source.nodeId === node ? l.target.nodeId : l.target.nodeId === node ? l.source.nodeId : null
      if (next === null || prev.has(next)) continue
      prev.set(next, { node, link: l.id })
      queue.push(next)
    }
  }
  if (!prev.has(to)) return null
  const deviceIds = [to]
  const linkIds: string[] = []
  for (let step = prev.get(to); step; step = prev.get(step.node)) {
    deviceIds.unshift(step.node)
    linkIds.unshift(step.link)
  }
  return { deviceIds, linkIds }
}
