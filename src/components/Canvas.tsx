import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from 'react'
import { activePage } from '../model/doc'
import { containsPoint, containsRect, intersects, nearestSide, normalizeRect, pageBounds, sideAnchor, snap } from '../model/geometry'
import { legendRows } from '../model/linkStyles'
import { clampZoom, LEGEND_ID, useEditor, type View } from '../model/store'
import type { Device, DeviceKind, Point, Rect, Side } from '../model/types'
import { buildPaths, midpoint } from '../routing/paths'
import { DeviceShape, Legend, LinkShape, SELECT, ZoneShape } from './shapes'

export const PALETTE_MIME = 'application/x-jalur-item'

type Mode =
  | { type: 'none' }
  | { type: 'pan'; sx: number; sy: number; view: View }
  | { type: 'move'; start: Point; applied: Point; free: boolean }
  | { type: 'marquee'; start: Point; additive: boolean; base: string[] }
  | { type: 'connect'; sourceId: string; side: Side | null }
  | { type: 'resize'; id: string; start: Point; rect: Rect; min: number }

interface Preview {
  from: Point
  to: Point
  target: Device | null
  targetSide: Side | null
}

interface Editing {
  id: string
  kind: 'device' | 'zone' | 'link'
  value: string
}

const SIDES: Side[] = ['top', 'right', 'bottom', 'left']
const OUT: Record<Side, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } }
const HANDLE_GAP = 12

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)

export function Canvas({ routes }: { routes: Map<string, Point[]> }) {
  const doc = useEditor((s) => s.doc)
  const page = activePage(doc)
  const selection = useEditor((s) => s.selection)
  const tool = useEditor((s) => s.tool)
  const view = useEditor((s) => s.view)
  const fitRequest = useEditor((s) => s.fitRequest)

  const svgRef = useRef<SVGSVGElement>(null)
  const mode = useRef<Mode>({ type: 'none' })
  const spaceHeld = useRef(false)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [dragging, setDragging] = useState(false)

  const paths = useMemo(() => buildPaths(routes), [routes])
  const rows = useMemo(() => legendRows(page), [page])
  const selected = useMemo(() => new Set(selection), [selection])

  const toWorld = (clientX: number, clientY: number): Point => {
    const r = svgRef.current!.getBoundingClientRect()
    const v = useEditor.getState().view
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom }
  }

  // Track the viewport size for zoom-to-centre and fit.
  useEffect(() => {
    const el = svgRef.current!
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      useEditor.getState().setViewport({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fit the page into view when asked and whenever the page changes.
  const routesRef = useRef(routes)
  routesRef.current = routes
  useEffect(() => {
    const s = useEditor.getState()
    const p = activePage(s.doc)
    const lr = legendRows(p)
    const b = pageBounds(p, routesRef.current, lr.types.length + lr.speeds.length)
    const { w, h } = s.viewport
    if (!b || w === 0) {
      s.setView({ x: w / 2, y: h / 2, zoom: 1 })
      return
    }
    const pad = 48
    const zoom = clampZoom(Math.min((w - pad * 2) / Math.max(b.w, 1), (h - pad * 2) / Math.max(b.h, 1), 1.5))
    s.setView({ zoom, x: w / 2 - (b.x + b.w / 2) * zoom, y: h / 2 - (b.y + b.h / 2) * zoom })
  }, [fitRequest, page.id])

  // Wheel pans; Ctrl/Cmd + wheel (and trackpad pinch) zooms at the pointer.
  useEffect(() => {
    const el = svgRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = useEditor.getState()
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        s.zoomBy(Math.exp(-e.deltaY * 0.0025), { x: e.clientX - r.left, y: e.clientY - r.top })
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX
        const dy = e.shiftKey ? 0 : e.deltaY
        s.setView({ ...s.view, x: s.view.x - dx, y: s.view.y - dy })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(document.activeElement)) {
        spaceHeld.current = true
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const deviceAt = (p: Point, exclude?: string): Device | null => {
    const devices = activePage(useEditor.getState().doc).devices
    for (let i = devices.length - 1; i >= 0; i--) {
      const d = devices[i]
      if (d.id !== exclude && containsPoint({ x: d.x - 4, y: d.y - 4, w: d.w + 8, h: d.h + 8 }, p)) return d
    }
    return null
  }

  const startConnect = (e: RPointerEvent, device: Device, side: Side | null) => {
    mode.current = { type: 'connect', sourceId: device.id, side }
    const from = side ? sideAnchor(device, side) : { x: device.x + device.w / 2, y: device.y + device.h / 2 }
    setPreview({ from, to: toWorld(e.clientX, e.clientY), target: null, targetSide: null })
  }

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (editing) return
    const s = useEditor.getState()
    const p = activePage(s.doc)
    const target = (e.target as Element).closest('[data-el]') as SVGElement | null
    const el = target?.dataset.el
    const id = target?.dataset.id
    const world = toWorld(e.clientX, e.clientY)
    svgRef.current!.setPointerCapture(e.pointerId)
    ;(document.activeElement as HTMLElement | null)?.blur?.()

    if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
      mode.current = { type: 'pan', sx: e.clientX, sy: e.clientY, view: s.view }
      setDragging(true)
      return
    }
    if (e.button !== 0) return

    if (el === 'handle' && id) {
      const device = p.devices.find((d) => d.id === id)
      if (device) startConnect(e, device, (target!.dataset.side as Side) ?? null)
      return
    }
    if (el === 'resize' && id) {
      const r = p.devices.find((d) => d.id === id) ?? p.zones.find((z) => z.id === id)
      if (!r) return
      s.beginGesture()
      mode.current = { type: 'resize', id, start: world, rect: { x: r.x, y: r.y, w: r.w, h: r.h }, min: 'kind' in r ? 40 : 64 }
      return
    }
    if (el === 'device' && id && s.tool === 'connect') {
      const device = p.devices.find((d) => d.id === id)!
      startConnect(e, device, nearestSide(device, world))
      return
    }
    if (el && id) {
      const additive = e.shiftKey || e.ctrlKey || e.metaKey
      if (additive) s.toggleSelection(id)
      else if (!s.selection.includes(id)) s.setSelection([id])
      if (el !== 'link') {
        s.beginGesture()
        mode.current = { type: 'move', start: world, applied: { x: 0, y: 0 }, free: e.altKey }
        setDragging(true)
      }
      return
    }
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    if (!additive) s.setSelection([])
    mode.current = { type: 'marquee', start: world, additive, base: additive ? s.selection : [] }
  }

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const m = mode.current
    if (m.type === 'none') return
    const s = useEditor.getState()
    if (m.type === 'pan') {
      s.setView({ ...m.view, x: m.view.x + e.clientX - m.sx, y: m.view.y + e.clientY - m.sy })
      return
    }
    const world = toWorld(e.clientX, e.clientY)
    if (m.type === 'move') {
      const free = m.free || e.altKey
      const tx = world.x - m.start.x
      const ty = world.y - m.start.y
      const want = free ? { x: tx, y: ty } : { x: snap(tx), y: snap(ty) }
      const dx = want.x - m.applied.x
      const dy = want.y - m.applied.y
      if (dx !== 0 || dy !== 0) {
        s.moveSelectionBy(dx, dy)
        m.applied = want
      }
    } else if (m.type === 'marquee') {
      setMarquee(normalizeRect(m.start, world))
    } else if (m.type === 'connect') {
      const target = deviceAt(world, m.sourceId)
      setPreview((prev) => prev && { ...prev, to: world, target, targetSide: target ? nearestSide(target, world) : null })
    } else if (m.type === 'resize') {
      const w = Math.max(m.min, snap(m.rect.w + world.x - m.start.x))
      const h = Math.max(m.min, snap(m.rect.h + world.y - m.start.y))
      s.resizeElement(m.id, { ...m.rect, w, h })
    }
  }

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const m = mode.current
    mode.current = { type: 'none' }
    setDragging(false)
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
    const s = useEditor.getState()
    if (m.type === 'move' || m.type === 'resize') s.endGesture()
    else if (m.type === 'marquee') {
      const rect = marquee
      setMarquee(null)
      if (!rect || rect.w < 3 || rect.h < 3) return
      const p = activePage(s.doc)
      const devIds = p.devices.filter((d) => intersects(rect, d)).map((d) => d.id)
      const devSet = new Set(devIds)
      const zoneIds = p.zones.filter((z) => containsRect(rect, z)).map((z) => z.id)
      const linkIds = p.links.filter((l) => devSet.has(l.source.nodeId) && devSet.has(l.target.nodeId)).map((l) => l.id)
      s.setSelection([...new Set([...m.base, ...zoneIds, ...devIds, ...linkIds])])
    } else if (m.type === 'connect') {
      const pv = preview
      setPreview(null)
      if (pv?.target) {
        s.addLink({ nodeId: m.sourceId, side: m.side, port: '' }, { nodeId: pv.target.id, side: pv.targetSide, port: '' })
      }
    }
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    // Pointer capture on the root SVG retargets dblclick to it, so look up what is under the pointer.
    const target = document
      .elementsFromPoint(e.clientX, e.clientY)
      .map((n) => n.closest('[data-el]') as SVGElement | null)
      .find((n) => n !== null)
    const el = target?.dataset.el
    const id = target?.dataset.id
    if (!id || (el !== 'device' && el !== 'zone' && el !== 'link')) return
    const item = el === 'device' ? page.devices.find((d) => d.id === id) : el === 'zone' ? page.zones.find((z) => z.id === id) : page.links.find((l) => l.id === id)
    if (item) setEditing({ id, kind: el, value: item.label })
  }

  const commitEdit = () => {
    if (!editing) return
    const s = useEditor.getState()
    const label = editing.value.trim()
    if (editing.kind === 'device') s.updateDevice(editing.id, { label })
    else if (editing.kind === 'zone') s.updateZone(editing.id, { label })
    else s.updateLink(editing.id, { label })
    setEditing(null)
  }

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(PALETTE_MIME)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }
  const onDrop = (e: DragEvent) => {
    const item = e.dataTransfer.getData(PALETTE_MIME)
    if (!item) return
    e.preventDefault()
    const at = toWorld(e.clientX, e.clientY)
    const s = useEditor.getState()
    if (item === 'zone') s.addZone({ x: at.x - 160, y: at.y - 100, w: 320, h: 200 })
    else s.addDevice(item as DeviceKind, at)
  }

  const editorBox = (() => {
    if (!editing) return null
    if (editing.kind === 'device') {
      const d = page.devices.find((x) => x.id === editing.id)
      if (!d) return null
      return { left: view.x + d.x * view.zoom, top: view.y + (d.y + d.h - 26) * view.zoom, width: Math.max(d.w * view.zoom, 120) }
    }
    if (editing.kind === 'zone') {
      const z = page.zones.find((x) => x.id === editing.id)
      if (!z) return null
      return { left: view.x + (z.x + 8) * view.zoom, top: view.y + (z.y + 4) * view.zoom, width: 200 }
    }
    const route = routes.get(editing.id)
    if (!route) return null
    const m = midpoint(route).p
    return { left: view.x + m.x * view.zoom - 80, top: view.y + m.y * view.zoom - 28, width: 160 }
  })()

  const single = selection.length === 1 ? selection[0] : null
  const singleRect = single ? (page.devices.find((d) => d.id === single) ?? page.zones.find((z) => z.id === single)) : undefined
  const hoveredDevice = tool === 'select' && !dragging && !preview ? page.devices.find((d) => d.id === hovered) : undefined
  const cursor = dragging && mode.current.type === 'pan' ? 'grabbing' : tool === 'connect' ? 'crosshair' : 'default'
  const grid = 16 * view.zoom

  return (
    <div className="canvas-wrap" onDragOver={onDragOver} onDrop={onDrop}>
      <svg
        ref={svgRef}
        className="canvas"
        data-canvas
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        onPointerOver={(e) => {
          const t = (e.target as Element).closest('[data-hover]') as SVGElement | null
          setHovered(t?.dataset.hover ?? null)
        }}
      >
        <defs>
          <pattern id="grid" width={grid} height={grid} patternUnits="userSpaceOnUse" x={view.x % grid} y={view.y % grid}>
            <circle cx={1} cy={1} r={1} fill="var(--grid)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <g
          data-world
          transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}
          fontFamily="Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        >
          <g>
            {page.zones.map((z) => (
              <ZoneShape key={z.id} zone={z} />
            ))}
          </g>
          <g>
            {page.links.map((l) => {
              const d = paths.get(l.id)
              const route = routes.get(l.id)
              if (!d || !route) return null
              return (
                <g key={l.id}>
                  {selected.has(l.id) && (
                    <path d={d} fill="none" stroke="#93c5fd" strokeWidth={10} strokeOpacity={0.7} strokeLinejoin="round" data-export="ignore" />
                  )}
                  <LinkShape link={l} d={d} route={route} />
                </g>
              )
            })}
          </g>
          <g>
            {page.devices.map((d) => (
              <g key={d.id} data-hover={d.id}>
                {hovered === d.id && tool === 'select' && (
                  <rect x={d.x - 22} y={d.y - 22} width={d.w + 44} height={d.h + 44} fill="transparent" data-export="ignore" />
                )}
                <DeviceShape device={d} />
                {hoveredDevice?.id === d.id &&
                  SIDES.map((side) => {
                    const a = sideAnchor(d, side)
                    return (
                      <circle
                        key={side}
                        data-el="handle"
                        data-id={d.id}
                        data-side={side}
                        data-export="ignore"
                        cx={a.x + OUT[side].x * HANDLE_GAP}
                        cy={a.y + OUT[side].y * HANDLE_GAP}
                        r={5}
                        fill="#fff"
                        stroke={SELECT}
                        strokeWidth={2}
                        style={{ cursor: 'crosshair' }}
                      />
                    )
                  })}
              </g>
            ))}
          </g>
          {page.showLegend && <Legend at={page.legend} rows={rows} />}

          <g data-export="ignore" pointerEvents="none">
            {page.devices
              .filter((d) => selected.has(d.id))
              .map((d) => (
                <rect key={d.id} x={d.x - 4} y={d.y - 4} width={d.w + 8} height={d.h + 8} rx={12} fill="none" stroke={SELECT} strokeWidth={1.5} strokeDasharray="4 3" />
              ))}
            {page.zones
              .filter((z) => selected.has(z.id))
              .map((z) => (
                <rect key={z.id} x={z.x - 3} y={z.y - 3} width={z.w + 6} height={z.h + 6} rx={16} fill="none" stroke={SELECT} strokeWidth={1.5} strokeDasharray="4 3" />
              ))}
            {selected.has(LEGEND_ID) && page.showLegend && rows.types.length + rows.speeds.length > 0 && (
              <rect x={page.legend.x - 4} y={page.legend.y - 4} width={188} height={34 + (rows.types.length + rows.speeds.length) * 20 + 8} rx={10} fill="none" stroke={SELECT} strokeDasharray="4 3" />
            )}
            {preview && (
              <>
                <line x1={preview.from.x} y1={preview.from.y} x2={preview.to.x} y2={preview.to.y} stroke={SELECT} strokeWidth={2} strokeDasharray="5 4" />
                {preview.target && (
                  <>
                    <rect x={preview.target.x - 4} y={preview.target.y - 4} width={preview.target.w + 8} height={preview.target.h + 8} rx={12} fill="none" stroke="#16a34a" strokeWidth={2} />
                    {SIDES.map((side) => {
                      const a = sideAnchor(preview.target!, side)
                      return <circle key={side} cx={a.x} cy={a.y} r={preview.targetSide === side ? 6 : 4} fill={preview.targetSide === side ? '#16a34a' : '#fff'} stroke="#16a34a" strokeWidth={2} />
                    })}
                  </>
                )}
              </>
            )}
            {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill={SELECT} fillOpacity={0.08} stroke={SELECT} strokeDasharray="4 3" />}
          </g>
          {singleRect && !dragging && (
            <rect
              data-el="resize"
              data-id={singleRect.id}
              data-export="ignore"
              x={singleRect.x + singleRect.w - 5}
              y={singleRect.y + singleRect.h - 5}
              width={10}
              height={10}
              fill="#fff"
              stroke={SELECT}
              strokeWidth={1.5}
              style={{ cursor: 'nwse-resize' }}
            />
          )}
        </g>
      </svg>
      {editing && editorBox && (
        <input
          className="inline-editor"
          style={{ left: editorBox.left, top: editorBox.top, width: editorBox.width }}
          autoFocus
          value={editing.value}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setEditing(null)
            e.stopPropagation()
          }}
        />
      )}
    </div>
  )
}
