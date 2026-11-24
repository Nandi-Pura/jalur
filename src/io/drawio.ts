import { isDeviceKind, specFor } from '../model/catalog'
import { emptyPage } from '../model/doc'
import { newId } from '../model/ids'
import { isLinkSpeed, isLinkType, linkTypeSpec, speedColor } from '../model/linkStyles'
import type { Device, DeviceKind, DiagramDoc, Link, LinkEnd, Page, Point, Side, Zone } from '../model/types'
import { DEVICE_ICONS, iconSvgString } from '../icons/icons'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)))

const SIDE_EXIT: Record<Side, [number, number]> = { top: [0.5, 0], right: [1, 0.5], bottom: [0.5, 1], left: [0, 0.5] }

function deviceStyle(kind: DeviceKind): string {
  const spec = specFor(kind)
  // draw.io reads data URIs in styles without ";base64" (a semicolon would end the value).
  const img = `data:image/svg+xml,${b64(iconSvgString(DEVICE_ICONS[kind], spec.color))}`
  return `rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${spec.color};verticalAlign=bottom;spacingBottom=4;fontStyle=1;image=${img};imageWidth=28;imageHeight=28;imageAlign=center;imageVerticalAlign=top;shape=label;`
}

function endStyle(prefix: 'exit' | 'entry', end: LinkEnd): string {
  if (!end.side) return ''
  const [x, y] = SIDE_EXIT[end.side]
  return `${prefix}X=${x};${prefix}Y=${y};${prefix}Dx=0;${prefix}Dy=0;`
}

function pageXml(page: Page, route: Map<string, Point[]>): string {
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']
  const zoneById = new Map(page.zones.map((z) => [z.id, z]))
  for (const z of page.zones) {
    cells.push(
      `<object id="${esc(z.id)}" label="${esc(z.label)}" jalurType="zone"><mxCell style="rounded=1;arcSize=6;dashed=1;html=1;fillColor=${z.color};opacity=100;fillOpacity=8;strokeColor=${z.color};fontColor=${z.color};fontStyle=1;verticalAlign=top;align=left;spacingLeft=10;container=1;collapsible=0;" vertex="1" parent="1"><mxGeometry x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" as="geometry"/></mxCell></object>`,
    )
  }
  for (const d of page.devices) {
    const zone = d.zoneId ? zoneById.get(d.zoneId) : undefined
    const x = zone ? d.x - zone.x : d.x
    const y = zone ? d.y - zone.y : d.y
    cells.push(
      `<object id="${esc(d.id)}" label="${esc(d.label)}" jalurType="device" jalurKind="${d.kind}" sublabel="${esc(d.sublabel)}"><mxCell style="${deviceStyle(d.kind)}" vertex="1" parent="${esc(zone ? zone.id : '1')}"><mxGeometry x="${x}" y="${y}" width="${d.w}" height="${d.h}" as="geometry"/></mxCell></object>`,
    )
  }
  for (const l of page.links) {
    const spec = linkTypeSpec(l.type)
    const pts = (route.get(l.id) ?? []).slice(1, -1)
    const dash = spec.dash ? `dashed=1;dashPattern=${spec.dash.replace(/ /g, ' ')};` : ''
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=none;startArrow=none;jumpStyle=arc;jumpSize=8;strokeColor=${speedColor(l.speed)};strokeWidth=${spec.double ? 4 : spec.width};${dash}${endStyle('exit', l.source)}${endStyle('entry', l.target)}`
    const points = pts.length ? `<Array as="points">${pts.map((p) => `<mxPoint x="${p.x}" y="${p.y}"/>`).join('')}</Array>` : ''
    cells.push(
      `<object id="${esc(l.id)}" label="${esc(l.label)}" jalurType="link" linkType="${l.type}" speed="${l.speed}" sourcePort="${esc(l.source.port)}" targetPort="${esc(l.target.port)}" sourceSide="${l.source.side ?? ''}" targetSide="${l.target.side ?? ''}"><mxCell style="${style}" edge="1" parent="1" source="${esc(l.source.nodeId)}" target="${esc(l.target.nodeId)}"><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell></object>`,
    )
    if (l.source.port) cells.push(portLabel(`${l.id}_sp`, l.id, l.source.port, -0.8))
    if (l.target.port) cells.push(portLabel(`${l.id}_tp`, l.id, l.target.port, 0.8))
  }
  return `<diagram id="${esc(page.id)}" name="${esc(page.name)}"><mxGraphModel grid="1" gridSize="8" page="0"><root>${cells.join('')}</root></mxGraphModel></diagram>`
}

const portLabel = (id: string, parent: string, text: string, x: number) =>
  `<mxCell id="${esc(id)}" value="${esc(text)}" style="edgeLabel;html=1;resizable=0;fontSize=10;labelBackgroundColor=#ffffff;" vertex="1" connectable="0" parent="${esc(parent)}"><mxGeometry x="${x}" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>`

/** An uncompressed .drawio file, one diagram per page, with routes kept as waypoints. */
export function exportDrawio(doc: DiagramDoc, routes: Map<string, Map<string, Point[]>>): string {
  const diagrams = doc.pages.map((p) => pageXml(p, routes.get(p.id) ?? new Map())).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="jalur" type="device">${diagrams}</mxfile>\n`
}

async function inflate(text: string): Promise<string> {
  const bytes = Uint8Array.from(atob(text.trim()), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const xml = await new Response(stream).text()
  return decodeURIComponent(xml)
}

const parseStyle = (style: string): Map<string, string> => {
  const m = new Map<string, string>()
  for (const part of style.split(';')) {
    if (!part) continue
    const i = part.indexOf('=')
    if (i < 0) m.set(part, '1')
    else m.set(part.slice(0, i), part.slice(i + 1))
  }
  return m
}

const KIND_HINTS: [RegExp, DeviceKind][] = [
  [/firewall|fortigate|asa|palo/i, 'firewall'],
  [/router|rtr/i, 'router'],
  [/switch|sw\b|l3|l2/i, 'switch'],
  [/load.?balanc|lb\b|f5/i, 'loadbalancer'],
  [/database|db\b|sql|cylinder/i, 'database'],
  [/storage|nas|san|disk/i, 'storage'],
  [/cloud/i, 'cloud'],
  [/internet|globe|wan/i, 'internet'],
  [/wireless|access.?point|ap\b|wifi|wlan/i, 'accesspoint'],
  [/laptop/i, 'laptop'],
  [/pc|workstation|desktop|monitor|computer/i, 'pc'],
  [/phone/i, 'phone'],
  [/printer/i, 'printer'],
  [/camera|cctv/i, 'camera'],
  [/server|host|vm\b/i, 'server'],
]

function guessKind(style: string, label: string): DeviceKind {
  const shape = parseStyle(style).get('shape') ?? ''
  for (const [re, kind] of KIND_HINTS) if (re.test(shape)) return kind
  for (const [re, kind] of KIND_HINTS) if (re.test(label)) return kind
  return 'generic'
}

const stripHtml = (s: string) => {
  if (!/[<&]/.test(s)) return s
  const d = new DOMParser().parseFromString(`<body>${s.replace(/<br\s*\/?>/gi, ' ')}</body>`, 'text/html')
  return (d.body.textContent ?? '').trim()
}

const sideFromExit = (x: string | undefined, y: string | undefined): Side | null => {
  if (x === undefined || y === undefined) return null
  const fx = Number(x)
  const fy = Number(y)
  if (fy === 0) return 'top'
  if (fy === 1) return 'bottom'
  if (fx === 0) return 'left'
  if (fx === 1) return 'right'
  return null
}

const asSide = (v: string | null): Side | null => (v === 'top' || v === 'right' || v === 'bottom' || v === 'left' ? v : null)

interface RawCell {
  id: string
  attrs: Element | null
  cell: Element
  label: string
}

function readPage(model: Element, name: string): Page {
  const page = emptyPage(name || 'Page')
  const raw: RawCell[] = []
  const root = model.querySelector('root')
  if (!root) return page
  for (const node of Array.from(root.children)) {
    if (node.tagName === 'mxCell') raw.push({ id: node.getAttribute('id') ?? '', attrs: null, cell: node, label: node.getAttribute('value') ?? '' })
    else {
      const cell = node.querySelector('mxCell')
      if (cell) raw.push({ id: node.getAttribute('id') ?? '', attrs: node, cell, label: node.getAttribute('label') ?? '' })
    }
  }
  const byId = new Map(raw.map((r) => [r.id, r]))
  const geo = (c: Element) => {
    const g = c.querySelector(':scope > mxGeometry')
    const n = (a: string, f = 0) => Number(g?.getAttribute(a) ?? f) || f
    return { x: n('x'), y: n('y'), w: n('width', 96), h: n('height', 72) }
  }
  const absCache = new Map<string, Point>()
  const origin = (id: string | null): Point => {
    if (!id || !byId.has(id)) return { x: 0, y: 0 }
    const cached = absCache.get(id)
    if (cached) return cached
    const r = byId.get(id)!
    if (r.cell.getAttribute('vertex') !== '1') return { x: 0, y: 0 }
    const g = geo(r.cell)
    const parent = origin(r.cell.getAttribute('parent'))
    const p = { x: parent.x + g.x, y: parent.y + g.y }
    absCache.set(id, p)
    return p
  }

  const ids = new Map<string, string>()
  for (const r of raw) {
    const c = r.cell
    if (c.getAttribute('vertex') !== '1') continue
    const parentId = c.getAttribute('parent')
    if (parentId && byId.get(parentId)?.cell.getAttribute('edge') === '1') continue
    const style = c.getAttribute('style') ?? ''
    const st = parseStyle(style)
    if (st.has('edgeLabel') || st.has('text')) continue
    const g = geo(c)
    const o = origin(parentId)
    const label = stripHtml(r.label)
    const type = r.attrs?.getAttribute('jalurType')
    const isZone = type === 'zone' || (!type && (st.get('container') === '1' || st.has('swimlane') || st.has('group')))
    if (isZone) {
      const id = newId('zone')
      ids.set(r.id, id)
      const color = st.get('strokeColor') && st.get('strokeColor') !== 'none' ? st.get('strokeColor')! : '#64748b'
      page.zones.push({ id, label, color, x: o.x + g.x, y: o.y + g.y, w: g.w, h: g.h } satisfies Zone)
      continue
    }
    const kindAttr = r.attrs?.getAttribute('jalurKind')
    const kind = isDeviceKind(kindAttr) ? kindAttr : guessKind(style, label)
    const id = newId('dev')
    ids.set(r.id, id)
    page.devices.push({
      id,
      kind,
      label,
      sublabel: r.attrs?.getAttribute('sublabel') ?? '',
      zoneId: null,
      x: o.x + g.x,
      y: o.y + g.y,
      w: Math.max(40, g.w),
      h: Math.max(40, g.h),
    } satisfies Device)
  }

  const portLabels = new Map<string, { source?: string; target?: string }>()
  for (const r of raw) {
    const parentId = r.cell.getAttribute('parent')
    if (r.cell.getAttribute('vertex') !== '1' || !parentId || byId.get(parentId)?.cell.getAttribute('edge') !== '1') continue
    const x = Number(r.cell.querySelector(':scope > mxGeometry')?.getAttribute('x') ?? 0)
    const entry = portLabels.get(parentId) ?? {}
    if (x < -0.3) entry.source = stripHtml(r.label)
    else if (x > 0.3) entry.target = stripHtml(r.label)
    portLabels.set(parentId, entry)
  }

  for (const r of raw) {
    const c = r.cell
    if (c.getAttribute('edge') !== '1') continue
    const s = ids.get(c.getAttribute('source') ?? '')
    const t = ids.get(c.getAttribute('target') ?? '')
    if (!s || !t || s === t || !page.devices.some((d) => d.id === s) || !page.devices.some((d) => d.id === t)) continue
    const st = parseStyle(c.getAttribute('style') ?? '')
    const a = r.attrs
    const ports = portLabels.get(r.id) ?? {}
    const linkType = a?.getAttribute('linkType')
    const speed = a?.getAttribute('speed')
    page.links.push({
      id: newId('link'),
      source: { nodeId: s, side: asSide(a?.getAttribute('sourceSide') ?? null) ?? sideFromExit(st.get('exitX'), st.get('exitY')), port: a?.getAttribute('sourcePort') || ports.source || '' },
      target: { nodeId: t, side: asSide(a?.getAttribute('targetSide') ?? null) ?? sideFromExit(st.get('entryX'), st.get('entryY')), port: a?.getAttribute('targetPort') || ports.target || '' },
      type: isLinkType(linkType) ? linkType : st.get('dashed') === '1' ? 'vpn' : 'ethernet',
      speed: isLinkSpeed(speed) ? speed : '',
      label: stripHtml(r.label),
    } satisfies Link)
  }

  for (const d of page.devices) {
    const cx = d.x + d.w / 2
    const cy = d.y + d.h / 2
    let best: Zone | null = null
    for (const z of page.zones) {
      if (cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h && (!best || z.w * z.h < best.w * best.h)) best = z
    }
    d.zoneId = best?.id ?? null
  }
  const maxY = Math.max(0, ...page.devices.map((d) => d.y + d.h), ...page.zones.map((z) => z.y + z.h))
  const minX = Math.min(0, ...page.devices.map((d) => d.x))
  page.legend = { x: minX, y: maxY + 40 }
  return page
}

/** Reads a .drawio / mxGraph XML file (compressed or not) into a jalur document. */
export async function importDrawio(xml: string, title = 'Imported diagram'): Promise<DiagramDoc> {
  const parsed = new DOMParser().parseFromString(xml, 'text/xml')
  if (parsed.querySelector('parsererror')) throw new Error('The file is not valid XML')
  const pages: Page[] = []
  const diagrams = Array.from(parsed.getElementsByTagName('diagram'))
  if (diagrams.length === 0) {
    const model = parsed.querySelector('mxGraphModel')
    if (!model) throw new Error('No draw.io diagram found in the file')
    pages.push(readPage(model, 'Page 1'))
  }
  for (const [i, d] of diagrams.entries()) {
    let model = d.querySelector('mxGraphModel')
    if (!model && d.textContent?.trim()) {
      const inner = new DOMParser().parseFromString(await inflate(d.textContent), 'text/xml')
      model = inner.querySelector('mxGraphModel')
    }
    if (model) pages.push(readPage(model, d.getAttribute('name') ?? `Page ${i + 1}`))
  }
  if (pages.length === 0) throw new Error('No draw.io diagram found in the file')
  return { format: 'jalur', version: 1, title, pages, activePageId: pages[0].id }
}

