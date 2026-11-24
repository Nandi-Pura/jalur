import { isDeviceKind, ZONE_COLORS } from '../model/catalog'
import { newId } from '../model/ids'
import { isLinkSpeed, isLinkType } from '../model/linkStyles'
import type { Device, DiagramDoc, Link, LinkEnd, Page, Side, Zone } from '../model/types'

export const serializeDoc = (doc: DiagramDoc): string => JSON.stringify(doc, null, 2)

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const SIDES: Side[] = ['top', 'right', 'bottom', 'left']
const side = (v: unknown): Side | null => (SIDES.includes(v as Side) ? (v as Side) : null)

function parseDevice(v: unknown): Device | null {
  if (!isObj(v)) return null
  return {
    id: str(v.id) || newId('dev'),
    kind: isDeviceKind(v.kind) ? v.kind : 'generic',
    label: str(v.label),
    sublabel: str(v.sublabel),
    zoneId: typeof v.zoneId === 'string' ? v.zoneId : null,
    x: num(v.x, 0),
    y: num(v.y, 0),
    w: Math.max(16, num(v.w, 96)),
    h: Math.max(16, num(v.h, 72)),
  }
}

function parseZone(v: unknown): Zone | null {
  if (!isObj(v)) return null
  return {
    id: str(v.id) || newId('zone'),
    label: str(v.label),
    color: str(v.color, ZONE_COLORS[0]),
    x: num(v.x, 0),
    y: num(v.y, 0),
    w: Math.max(32, num(v.w, 320)),
    h: Math.max(32, num(v.h, 200)),
  }
}

function parseEnd(v: unknown): LinkEnd | null {
  if (!isObj(v) || typeof v.nodeId !== 'string') return null
  return { nodeId: v.nodeId, side: side(v.side), port: str(v.port) }
}

function parseLink(v: unknown, deviceIds: Set<string>): Link | null {
  if (!isObj(v)) return null
  const source = parseEnd(v.source)
  const target = parseEnd(v.target)
  if (!source || !target || !deviceIds.has(source.nodeId) || !deviceIds.has(target.nodeId)) return null
  return {
    id: str(v.id) || newId('link'),
    source,
    target,
    type: isLinkType(v.type) ? v.type : 'ethernet',
    speed: isLinkSpeed(v.speed) ? v.speed : '',
    label: str(v.label),
  }
}

function parsePage(v: unknown, index: number): Page {
  if (!isObj(v)) throw new Error(`Page ${index + 1} is not an object`)
  const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
  const devices = list(v.devices).map(parseDevice).filter((d): d is Device => d !== null)
  const zones = list(v.zones).map(parseZone).filter((z): z is Zone => z !== null)
  const zoneIds = new Set(zones.map((z) => z.id))
  for (const d of devices) if (d.zoneId && !zoneIds.has(d.zoneId)) d.zoneId = null
  const deviceIds = new Set(devices.map((d) => d.id))
  const links = list(v.links)
    .map((l) => parseLink(l, deviceIds))
    .filter((l): l is Link => l !== null)
  const legend = isObj(v.legend) ? { x: num(v.legend.x, 40), y: num(v.legend.y, 40) } : { x: 40, y: 40 }
  return {
    id: str(v.id) || newId('page'),
    name: str(v.name, `Page ${index + 1}`),
    devices,
    zones,
    links,
    showLegend: v.showLegend !== false,
    legend,
  }
}

/** Parses and validates a saved diagram, filling defaults and dropping dangling links. */
export function parseDoc(input: string | unknown): DiagramDoc {
  let data: unknown = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch {
      throw new Error('The file is not valid JSON')
    }
  }
  if (!isObj(data) || data.format !== 'jalur') throw new Error('The file is not a jalur diagram')
  if (!Array.isArray(data.pages) || data.pages.length === 0) throw new Error('The diagram has no pages')
  const pages = data.pages.map(parsePage)
  const activePageId = pages.some((p) => p.id === data.activePageId) ? (data.activePageId as string) : pages[0].id
  return { format: 'jalur', version: 1, title: str(data.title, 'Untitled diagram'), pages, activePageId }
}
