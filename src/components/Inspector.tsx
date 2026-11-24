import { tracePath } from '../model/cables'
import { DEVICE_SPECS, ZONE_COLORS } from '../model/catalog'
import { activePage } from '../model/doc'
import { LINK_SPEEDS, LINK_TYPES } from '../model/linkStyles'
import { notify } from '../model/notify'
import { LEGEND_ID, useEditor } from '../model/store'
import type { Device, DeviceKind, Link, LinkSpeed, LinkType, Side, Zone } from '../model/types'
import { NumberField, SelectField, TextField } from './fields'

const SIDE_OPTIONS: { value: Side | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Auto (router picks)' },
  { value: 'top', label: 'Top' },
  { value: 'right', label: 'Right' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
]
const TYPE_OPTIONS = LINK_TYPES.map((t) => ({ value: t.type, label: t.name }))
const SPEED_OPTIONS = LINK_SPEEDS.map((s) => ({ value: s.speed, label: s.name }))

function DeviceInspector({ device }: { device: Device }) {
  const update = useEditor((s) => s.updateDevice)
  const page = useEditor((s) => activePage(s.doc))
  const links = page.links.filter((l) => l.source.nodeId === device.id || l.target.nodeId === device.id)
  const zone = page.zones.find((z) => z.id === device.zoneId)
  return (
    <>
      <h2>Device</h2>
      <TextField label="Name" value={device.label} onCommit={(label) => update(device.id, { label })} />
      <TextField label="Detail (IP, model…)" value={device.sublabel} placeholder="e.g. 10.0.0.1" onCommit={(sublabel) => update(device.id, { sublabel })} />
      <SelectField<DeviceKind> label="Type" value={device.kind} options={DEVICE_SPECS.map((s) => ({ value: s.kind, label: s.name }))} onChange={(kind) => update(device.id, { kind })} />
      <div className="row">
        <NumberField label="Width" value={device.w} min={40} onCommit={(w) => update(device.id, { w })} />
        <NumberField label="Height" value={device.h} min={40} onCommit={(h) => update(device.id, { h })} />
      </div>
      <p className="meta">Zone: {zone ? zone.label : 'none'} · {links.length} cable{links.length === 1 ? '' : 's'}</p>
    </>
  )
}

function ZoneInspector({ zone }: { zone: Zone }) {
  const update = useEditor((s) => s.updateZone)
  const members = useEditor((s) => activePage(s.doc).devices.filter((d) => d.zoneId === zone.id).length)
  return (
    <>
      <h2>Zone</h2>
      <TextField label="Name" value={zone.label} onCommit={(label) => update(zone.id, { label })} />
      <div className="field">
        <span>Colour</span>
        <div className="swatches">
          {ZONE_COLORS.map((c) => (
            <button key={c} className={`swatch${c === zone.color ? ' active' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => update(zone.id, { color: c })} />
          ))}
        </div>
      </div>
      <p className="meta">{members} device{members === 1 ? '' : 's'} inside. Moving the zone moves them too.</p>
    </>
  )
}

function LinkInspector({ link }: { link: Link }) {
  const update = useEditor((s) => s.updateLink)
  const devices = useEditor((s) => activePage(s.doc).devices)
  const name = (id: string) => devices.find((d) => d.id === id)?.label || '?'
  return (
    <>
      <h2>Cable</h2>
      <p className="meta">
        {name(link.source.nodeId)} → {name(link.target.nodeId)}
      </p>
      <SelectField<LinkType> label="Link type" value={link.type} options={TYPE_OPTIONS} onChange={(type) => update(link.id, { type })} />
      <SelectField<LinkSpeed> label="Speed" value={link.speed} options={SPEED_OPTIONS} onChange={(speed) => update(link.id, { speed })} />
      <TextField label="Label" value={link.label} onCommit={(label) => update(link.id, { label })} />
      <div className="row">
        <TextField label={`Port at ${name(link.source.nodeId)}`} value={link.source.port} placeholder="Gi1/0/1" onCommit={(port) => update(link.id, { source: { ...link.source, port } })} />
        <TextField label={`Port at ${name(link.target.nodeId)}`} value={link.target.port} placeholder="eth0" onCommit={(port) => update(link.id, { target: { ...link.target, port } })} />
      </div>
      <div className="row">
        <SelectField label="Leaves from" value={link.source.side ?? 'auto'} options={SIDE_OPTIONS} onChange={(v) => update(link.id, { source: { ...link.source, side: v === 'auto' ? null : v } })} />
        <SelectField label="Arrives at" value={link.target.side ?? 'auto'} options={SIDE_OPTIONS} onChange={(v) => update(link.id, { target: { ...link.target, side: v === 'auto' ? null : v } })} />
      </div>
      <button className="btn" onClick={() => update(link.id, { source: link.target, target: link.source })}>
        Swap ends
      </button>
    </>
  )
}

function MultiInspector({ ids }: { ids: string[] }) {
  const page = useEditor((s) => activePage(s.doc))
  const updateLinks = useEditor((s) => s.updateLinks)
  const wrap = useEditor((s) => s.wrapSelectionInZone)
  const set = new Set(ids)
  const links = page.links.filter((l) => set.has(l.id))
  const devices = page.devices.filter((d) => set.has(d.id))
  const same = <T,>(vals: T[]) => vals.every((v) => v === vals[0])
  const trace = () => {
    const path = tracePath(page, devices[0].id, devices[1].id)
    if (!path) return notify(`${devices[0].label || 'These devices'} and ${devices[1].label || 'the other'} aren't connected on this page.`, 'error')
    const names = path.deviceIds.map((id) => page.devices.find((d) => d.id === id)?.label || '?')
    useEditor.getState().setSelection([...path.deviceIds, ...path.linkIds])
    notify(`Path (${path.linkIds.length} cable${path.linkIds.length === 1 ? '' : 's'}): ${names.join(' → ')}`)
  }
  return (
    <>
      <h2>{ids.length} selected</h2>
      <p className="meta">
        {devices.length} device{devices.length === 1 ? '' : 's'}, {links.length} cable{links.length === 1 ? '' : 's'}
      </p>
      {links.length > 0 && (
        <>
          <SelectField<LinkType> label="Link type (all cables)" value={links[0].type} mixed={!same(links.map((l) => l.type))} options={TYPE_OPTIONS} onChange={(type) => updateLinks(links.map((l) => l.id), { type })} />
          <SelectField<LinkSpeed> label="Speed (all cables)" value={links[0].speed} mixed={!same(links.map((l) => l.speed))} options={SPEED_OPTIONS} onChange={(speed) => updateLinks(links.map((l) => l.id), { speed })} />
        </>
      )}
      {devices.length === 2 && ids.length === 2 && (
        <button className="btn" onClick={trace} title="Select the fewest cables that connect these two devices">
          Trace path between them
        </button>
      )}
      {devices.length > 0 && (
        <button className="btn" onClick={wrap}>
          Wrap in a zone
        </button>
      )}
    </>
  )
}

function DocumentInspector() {
  const doc = useEditor((s) => s.doc)
  const page = activePage(doc)
  const setTitle = useEditor((s) => s.setTitle)
  const renamePage = useEditor((s) => s.renamePage)
  const toggleLegend = useEditor((s) => s.toggleLegend)
  return (
    <>
      <h2>Diagram</h2>
      <TextField label="Title" value={doc.title} onCommit={setTitle} />
      <TextField label="Page name" value={page.name} onCommit={(name) => renamePage(page.id, name || page.name)} />
      <label className="check">
        <input type="checkbox" checked={page.showLegend} onChange={toggleLegend} /> Show legend on this page
      </label>
      <p className="meta">
        {page.devices.length} devices · {page.links.length} cables · {page.zones.length} zones
      </p>
      <h3>Tips</h3>
      <ul className="tips">
        <li>Double-click anything to rename it.</li>
        <li>Drag on empty canvas to select an area; Shift-click to add.</li>
        <li>Hold Space and drag, or scroll, to pan. Ctrl + scroll zooms.</li>
        <li>Hold Alt while dragging to move off the grid.</li>
      </ul>
    </>
  )
}

export function Inspector() {
  const selection = useEditor((s) => s.selection)
  const page = useEditor((s) => activePage(s.doc))
  let body = <DocumentInspector />
  if (selection.length > 1) body = <MultiInspector ids={selection} />
  else if (selection.length === 1) {
    const id = selection[0]
    const device = page.devices.find((d) => d.id === id)
    const zone = page.zones.find((z) => z.id === id)
    const link = page.links.find((l) => l.id === id)
    if (device) body = <DeviceInspector key={id} device={device} />
    else if (zone) body = <ZoneInspector key={id} zone={zone} />
    else if (link) body = <LinkInspector key={id} link={link} />
    else if (id === LEGEND_ID) body = <><h2>Legend</h2><p className="meta">The legend lists only the link types and speeds used on this page. Drag it to move it; Delete hides it.</p></>
  }
  return (
    <aside className="inspector" aria-label="Properties">
      {body}
    </aside>
  )
}
