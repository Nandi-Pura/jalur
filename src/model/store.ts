import { create } from 'zustand'
import { specFor, ZONE_COLORS } from './catalog'
import { activePage, assignZones, emptyDoc, emptyPage, uniquePageName, updateActivePage } from './doc'
import { boundsOf, snap } from './geometry'
import { newId } from './ids'
import type { Device, DeviceKind, DiagramDoc, Link, LinkEnd, Page, Point, Rect, Zone } from './types'

export type Tool = 'select' | 'connect'

export interface View {
  x: number
  y: number
  zoom: number
}

interface Clipboard {
  devices: Device[]
  zones: Zone[]
  links: Link[]
}

export const LEGEND_ID = 'legend'
const HISTORY_LIMIT = 200
export const clampZoom = (z: number): number => Math.min(4, Math.max(0.1, z))

export interface EditorState {
  doc: DiagramDoc
  selection: string[]
  tool: Tool
  view: View
  past: DiagramDoc[]
  future: DiagramDoc[]
  gestureStart: DiagramDoc | null
  clipboard: Clipboard | null
  viewport: { w: number; h: number }
  fitRequest: number

  loadDoc: (doc: DiagramDoc) => void
  newDoc: () => void
  setTitle: (title: string) => void
  setTool: (tool: Tool) => void
  setView: (view: View) => void
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void
  selectAll: () => void

  addDevice: (kind: DeviceKind, at: Point) => string
  addZone: (rect: Rect) => string
  addLink: (source: LinkEnd, target: LinkEnd) => string | null
  updateDevice: (id: string, patch: Partial<Omit<Device, 'id'>>) => void
  updateZone: (id: string, patch: Partial<Omit<Zone, 'id'>>) => void
  updateLink: (id: string, patch: Partial<Omit<Link, 'id'>>) => void
  deleteSelection: () => void
  copySelection: () => void
  paste: () => void
  duplicateSelection: () => void
  nudgeSelection: (dx: number, dy: number) => void
  toggleLegend: () => void
  updateLinks: (ids: string[], patch: Partial<Omit<Link, 'id'>>) => void
  wrapSelectionInZone: () => void
  setViewport: (size: { w: number; h: number }) => void
  zoomBy: (factor: number, around?: Point) => void
  requestFit: () => void

  beginGesture: () => void
  moveSelectionBy: (dx: number, dy: number) => void
  resizeElement: (id: string, rect: Rect) => void
  endGesture: () => void

  undo: () => void
  redo: () => void

  addPage: () => void
  renamePage: (id: string, name: string) => void
  deletePage: (id: string) => void
  setActivePage: (id: string) => void
}

const pushPast = (past: DiagramDoc[], doc: DiagramDoc): DiagramDoc[] => [...past, doc].slice(-HISTORY_LIMIT)

/** Moves the selected devices, zones (with their members) and legend by a delta. */
export function moveElements(page: Page, ids: Set<string>, dx: number, dy: number): Page {
  const movedZones = new Set(page.zones.filter((z) => ids.has(z.id)).map((z) => z.id))
  const moveDevice = (d: Device) => ids.has(d.id) || (d.zoneId !== null && movedZones.has(d.zoneId))
  return {
    ...page,
    devices: page.devices.map((d) => (moveDevice(d) ? { ...d, x: d.x + dx, y: d.y + dy } : d)),
    zones: page.zones.map((z) => (movedZones.has(z.id) ? { ...z, x: z.x + dx, y: z.y + dy } : z)),
    legend: ids.has(LEGEND_ID) ? { x: page.legend.x + dx, y: page.legend.y + dy } : page.legend,
  }
}

export function deleteElements(page: Page, ids: Set<string>): Page {
  const devices = page.devices.filter((d) => !ids.has(d.id))
  const remaining = new Set(devices.map((d) => d.id))
  const zones = page.zones.filter((z) => !ids.has(z.id))
  const zoneIds = new Set(zones.map((z) => z.id))
  return {
    ...page,
    zones,
    devices: devices.map((d) => (d.zoneId && !zoneIds.has(d.zoneId) ? { ...d, zoneId: null } : d)),
    links: page.links.filter(
      (l) => !ids.has(l.id) && remaining.has(l.source.nodeId) && remaining.has(l.target.nodeId),
    ),
    showLegend: ids.has(LEGEND_ID) ? false : page.showLegend,
  }
}

/** Copies elements with fresh ids; links come along only when both ends are copied. */
export function cloneElements(clip: Clipboard, offset: number): Clipboard & { ids: string[] } {
  const idMap = new Map<string, string>()
  const zones = clip.zones.map((z) => {
    const id = newId('zone')
    idMap.set(z.id, id)
    return { ...z, id, x: z.x + offset, y: z.y + offset }
  })
  const devices = clip.devices.map((d) => {
    const id = newId('dev')
    idMap.set(d.id, id)
    return { ...d, id, x: d.x + offset, y: d.y + offset, zoneId: d.zoneId ? (idMap.get(d.zoneId) ?? null) : null }
  })
  const links = clip.links
    .filter((l) => idMap.has(l.source.nodeId) && idMap.has(l.target.nodeId))
    .map((l) => ({
      ...l,
      id: newId('link'),
      source: { ...l.source, nodeId: idMap.get(l.source.nodeId)! },
      target: { ...l.target, nodeId: idMap.get(l.target.nodeId)! },
    }))
  return { devices, zones, links, ids: [...zones, ...devices, ...links].map((e) => e.id) }
}

function nextLabel(page: Page, base: string): string {
  const used = new Set(page.devices.map((d) => d.label))
  let i = 1
  while (used.has(`${base}-${String(i).padStart(2, '0')}`)) i++
  return `${base}-${String(i).padStart(2, '0')}`
}

const LABEL_PREFIX: Record<DeviceKind, string> = {
  router: 'RTR',
  switch: 'SW',
  firewall: 'FW',
  loadbalancer: 'LB',
  server: 'SRV',
  database: 'DB',
  storage: 'NAS',
  cloud: 'Cloud',
  internet: 'Internet',
  accesspoint: 'AP',
  pc: 'PC',
  laptop: 'LT',
  phone: 'PHN',
  printer: 'PRN',
  camera: 'CAM',
  generic: 'DEV',
}

export const useEditor = create<EditorState>()((set, get) => {
  const commit = (fn: (page: Page) => Page, selection?: string[]) => {
    const { doc, past } = get()
    const next = updateActivePage(doc, fn)
    if (next === doc) return
    set({ doc: next, past: pushPast(past, doc), future: [], ...(selection ? { selection } : {}) })
  }
  const commitDoc = (fn: (doc: DiagramDoc) => DiagramDoc, extra: Partial<EditorState> = {}) => {
    const { doc, past } = get()
    const next = fn(doc)
    if (next === doc) return
    set({ doc: next, past: pushPast(past, doc), future: [], ...extra })
  }
  const page = () => activePage(get().doc)

  return {
    doc: emptyDoc(),
    selection: [],
    tool: 'select',
    view: { x: 0, y: 0, zoom: 1 },
    past: [],
    future: [],
    gestureStart: null,
    clipboard: null,
    viewport: { w: 800, h: 600 },
    fitRequest: 0,

    loadDoc: (doc) => set({ doc, selection: [], past: [], future: [], gestureStart: null }),
    newDoc: () => commitDoc(() => emptyDoc(), { selection: [] }),
    setTitle: (title) => commitDoc((doc) => (doc.title === title ? doc : { ...doc, title })),
    setTool: (tool) => set({ tool }),
    setView: (view) => set({ view }),
    setSelection: (ids) => set({ selection: ids }),
    toggleSelection: (id) => {
      const sel = get().selection
      set({ selection: sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id] })
    },
    selectAll: () => {
      const p = page()
      set({ selection: [...p.zones, ...p.devices, ...p.links].map((e) => e.id) })
    },

    addDevice: (kind, at) => {
      const spec = specFor(kind)
      const id = newId('dev')
      commit((p) => {
        const device: Device = {
          id,
          kind,
          label: nextLabel(p, LABEL_PREFIX[kind]),
          sublabel: '',
          zoneId: null,
          x: snap(at.x - spec.w / 2),
          y: snap(at.y - spec.h / 2),
          w: spec.w,
          h: spec.h,
        }
        return assignZones({ ...p, devices: [...p.devices, device] }, new Set([id]))
      }, [id])
      return id
    },
    addZone: (rect) => {
      const id = newId('zone')
      commit((p) => {
        const zone: Zone = {
          id,
          label: `Zone ${p.zones.length + 1}`,
          color: ZONE_COLORS[p.zones.length % ZONE_COLORS.length],
          x: snap(rect.x),
          y: snap(rect.y),
          w: Math.max(64, snap(rect.w)),
          h: Math.max(64, snap(rect.h)),
        }
        return assignZones({ ...p, zones: [...p.zones, zone] })
      }, [id])
      return id
    },
    addLink: (source, target) => {
      if (source.nodeId === target.nodeId) return null
      const id = newId('link')
      commit(
        (p) => ({ ...p, links: [...p.links, { id, source, target, type: 'ethernet', speed: '', label: '' }] }),
        [id],
      )
      return id
    },
    updateDevice: (id, patch) =>
      commit((p) => {
        const devices = p.devices.map((d) => (d.id === id ? { ...d, ...patch } : d))
        return assignZones({ ...p, devices }, new Set([id]))
      }),
    updateZone: (id, patch) => commit((p) => ({ ...p, zones: p.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) })),
    updateLink: (id, patch) => commit((p) => ({ ...p, links: p.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
    deleteSelection: () => {
      const ids = new Set(get().selection)
      if (ids.size === 0) return
      commit((p) => assignZones(deleteElements(p, ids)), [])
    },
    copySelection: () => {
      const ids = new Set(get().selection)
      const p = page()
      const zones = p.zones.filter((z) => ids.has(z.id))
      const zoneIds = new Set(zones.map((z) => z.id))
      const devices = p.devices.filter((d) => ids.has(d.id) || (d.zoneId !== null && zoneIds.has(d.zoneId)))
      if (devices.length === 0 && zones.length === 0) return
      const deviceIds = new Set(devices.map((d) => d.id))
      const links = p.links.filter((l) => deviceIds.has(l.source.nodeId) && deviceIds.has(l.target.nodeId))
      set({ clipboard: { devices, zones, links } })
    },
    paste: () => {
      const clip = get().clipboard
      if (!clip) return
      const copy = cloneElements(clip, 24)
      commit(
        (p) =>
          assignZones(
            { ...p, zones: [...p.zones, ...copy.zones], devices: [...p.devices, ...copy.devices], links: [...p.links, ...copy.links] },
            new Set(copy.devices.filter((d) => !d.zoneId).map((d) => d.id)),
          ),
        copy.ids,
      )
      set({ clipboard: { devices: copy.devices, zones: copy.zones, links: copy.links } })
    },
    duplicateSelection: () => {
      const saved = get().clipboard
      get().copySelection()
      if (get().clipboard !== saved) {
        get().paste()
        set({ clipboard: saved })
      }
    },
    nudgeSelection: (dx, dy) => {
      const ids = new Set(get().selection)
      if (ids.size === 0) return
      commit((p) => assignZones(moveElements(p, ids, dx, dy)))
    },
    toggleLegend: () => commit((p) => ({ ...p, showLegend: !p.showLegend })),
    updateLinks: (ids, patch) => {
      const set_ = new Set(ids)
      commit((p) => ({ ...p, links: p.links.map((l) => (set_.has(l.id) ? { ...l, ...patch } : l)) }))
    },
    wrapSelectionInZone: () => {
      const ids = new Set(get().selection)
      const members = page().devices.filter((d) => ids.has(d.id))
      const b = boundsOf(members)
      if (!b) return
      get().addZone({ x: b.x - 32, y: b.y - 48, w: b.w + 64, h: b.h + 80 })
    },
    setViewport: (viewport) => set({ viewport }),
    zoomBy: (factor, around) => {
      const { view, viewport } = get()
      const zoom = clampZoom(view.zoom * factor)
      const c = around ?? { x: viewport.w / 2, y: viewport.h / 2 }
      const k = zoom / view.zoom
      set({ view: { zoom, x: c.x - (c.x - view.x) * k, y: c.y - (c.y - view.y) * k } })
    },
    requestFit: () => set({ fitRequest: get().fitRequest + 1 }),

    beginGesture: () => set({ gestureStart: get().doc }),
    moveSelectionBy: (dx, dy) => {
      const ids = new Set(get().selection)
      set({ doc: updateActivePage(get().doc, (p) => moveElements(p, ids, dx, dy)) })
    },
    resizeElement: (id, rect) =>
      set({
        doc: updateActivePage(get().doc, (p) => ({
          ...p,
          devices: p.devices.map((d) => (d.id === id ? { ...d, ...rect } : d)),
          zones: p.zones.map((z) => (z.id === id ? { ...z, ...rect } : z)),
        })),
      }),
    endGesture: () => {
      const { gestureStart, past } = get()
      if (!gestureStart) return
      const doc = updateActivePage(get().doc, (p) => assignZones(p))
      if (doc === gestureStart) set({ gestureStart: null })
      else set({ doc, gestureStart: null, past: pushPast(past, gestureStart), future: [] })
    },

    undo: () => {
      const { past, future, doc } = get()
      if (past.length === 0) return
      set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], selection: [] })
    },
    redo: () => {
      const { past, future, doc } = get()
      if (future.length === 0) return
      set({ doc: future[0], future: future.slice(1), past: pushPast(past, doc), selection: [] })
    },

    addPage: () =>
      commitDoc(
        (doc) => {
          const p = emptyPage(uniquePageName(doc))
          return { ...doc, pages: [...doc.pages, p], activePageId: p.id }
        },
        { selection: [] },
      ),
    renamePage: (id, name) =>
      commitDoc((doc) => ({ ...doc, pages: doc.pages.map((p) => (p.id === id ? { ...p, name } : p)) })),
    deletePage: (id) =>
      commitDoc(
        (doc) => {
          if (doc.pages.length <= 1) return doc
          const pages = doc.pages.filter((p) => p.id !== id)
          return { ...doc, pages, activePageId: doc.activePageId === id ? pages[0].id : doc.activePageId }
        },
        { selection: [] },
      ),
    setActivePage: (id) => {
      const { doc } = get()
      if (doc.activePageId === id || !doc.pages.some((p) => p.id === id)) return
      set({ doc: { ...doc, activePageId: id }, selection: [] })
    },
  }
})

export const selectActivePage = (s: EditorState): Page => activePage(s.doc)
