import { SquareDashed } from 'lucide'
import { DEVICE_SPECS } from '../model/catalog'
import { useEditor } from '../model/store'
import { DEVICE_ICONS, type IconNode } from '../icons/icons'
import { Icon } from '../icons/Icon'
import { PALETTE_MIME } from './Canvas'

export function Palette() {
  const addAtCentre = (item: string) => {
    const { view, viewport, addDevice, addZone } = useEditor.getState()
    const at = { x: (viewport.w / 2 - view.x) / view.zoom, y: (viewport.h / 2 - view.y) / view.zoom }
    if (item === 'zone') addZone({ x: at.x - 160, y: at.y - 100, w: 320, h: 200 })
    else addDevice(item as never, at)
  }
  const itemProps = (item: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(PALETTE_MIME, item)
      e.dataTransfer.effectAllowed = 'copy'
    },
    onClick: () => addAtCentre(item),
  })
  return (
    <aside className="palette" aria-label="Palette">
      <h2>Devices</h2>
      <div className="palette-grid">
        {DEVICE_SPECS.map((s) => (
          <button key={s.kind} className="palette-item" title={`${s.name} — click or drag onto the canvas`} {...itemProps(s.kind)}>
            <Icon node={DEVICE_ICONS[s.kind]} size={22} stroke={s.color} />
            <span>{s.name}</span>
          </button>
        ))}
      </div>
      <h2>Structure</h2>
      <div className="palette-grid">
        <button className="palette-item" title="Zone — groups devices; moving it moves them" {...itemProps('zone')}>
          <Icon node={SquareDashed as IconNode} size={22} />
          <span>Zone</span>
        </button>
      </div>
      <p className="hint">Drag between the round handles on a device to cable it, or press C for the connector tool.</p>
    </aside>
  )
}
