import { memo } from 'react'
import { specFor } from '../model/catalog'
import { LEGEND_WIDTH, legendHeight } from '../model/geometry'
import { linkTypeSpec, speedColor, type LegendRows } from '../model/linkStyles'
import type { Device, Link, Point, Zone } from '../model/types'
import { DEVICE_ICONS } from '../icons/icons'
import { Icon } from '../icons/Icon'
import { midpoint, portLabelPosition } from '../routing/paths'

export const PAPER = '#ffffff'
export const INK = '#0f172a'
export const MUTED = '#64748b'
export const SELECT = '#2563eb'
const HALO = { paintOrder: 'stroke' as const, stroke: PAPER, strokeWidth: 3, strokeLinejoin: 'round' as const }

export const DeviceShape = memo(function DeviceShape({ device }: { device: Device }) {
  const spec = specFor(device.kind)
  const { w, h } = device
  const iconSize = Math.min(30, h * 0.42)
  return (
    <g data-el="device" data-id={device.id} transform={`translate(${device.x} ${device.y})`} style={{ cursor: 'move' }}>
      <rect width={w} height={h} rx={10} fill={PAPER} stroke={spec.color} strokeWidth={1.5} />
      <rect width={w} height={4} rx={2} fill={spec.color} opacity={0.85} />
      <Icon node={DEVICE_ICONS[device.kind]} x={(w - iconSize) / 2} y={9} size={iconSize} stroke={spec.color} />
      <text
        x={w / 2}
        y={device.sublabel ? h - 18 : h - 11}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill={INK}
      >
        {device.label}
      </text>
      {device.sublabel && (
        <text x={w / 2} y={h - 6} textAnchor="middle" fontSize={10} fill={MUTED}>
          {device.sublabel}
        </text>
      )}
    </g>
  )
})

export const ZoneShape = memo(function ZoneShape({ zone }: { zone: Zone }) {
  return (
    <g data-el="zone" data-id={zone.id} transform={`translate(${zone.x} ${zone.y})`} style={{ cursor: 'move' }}>
      <rect width={zone.w} height={zone.h} rx={14} fill={zone.color} fillOpacity={0.07} stroke={zone.color} strokeWidth={1.5} strokeDasharray="7 5" />
      <text x={14} y={22} fontSize={13} fontWeight={700} fill={zone.color}>
        {zone.label}
      </text>
    </g>
  )
})

interface LinkShapeProps {
  link: Link
  d: string
  route: Point[]
}

export const LinkShape = memo(function LinkShape({ link, d, route }: LinkShapeProps) {
  const spec = linkTypeSpec(link.type)
  const color = speedColor(link.speed)
  const src = route.length > 1 && link.source.port ? portLabelPosition(route, true) : null
  const dst = route.length > 1 && link.target.port ? portLabelPosition(route, false) : null
  const mid = link.label && route.length > 1 ? midpoint(route).p : null
  return (
    <g data-el="link" data-id={link.id} style={{ cursor: 'pointer' }}>
      <path d={d} fill="none" stroke="transparent" strokeWidth={14} data-export="ignore" />
      {spec.double ? (
        <>
          <path d={d} fill="none" stroke={color} strokeWidth={spec.width} strokeLinejoin="round" />
          <path d={d} fill="none" stroke={PAPER} strokeWidth={spec.width / 3} strokeLinejoin="round" />
        </>
      ) : (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={spec.width}
          strokeDasharray={spec.dash || undefined}
          strokeLinecap={link.type === 'wireless' ? 'round' : 'butt'}
          strokeLinejoin="round"
        />
      )}
      {src && (
        <text x={src.x} y={src.y} textAnchor={src.anchor} fontSize={10} fill={INK} {...HALO}>
          {link.source.port}
        </text>
      )}
      {dst && (
        <text x={dst.x} y={dst.y} textAnchor={dst.anchor} fontSize={10} fill={INK} {...HALO}>
          {link.target.port}
        </text>
      )}
      {mid && (
        <text x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK} {...HALO}>
          {link.label}
        </text>
      )}
    </g>
  )
})

export function Legend({ at, rows }: { at: Point; rows: LegendRows }) {
  const count = rows.types.length + rows.speeds.length
  if (count === 0) return null
  const h = legendHeight(count)
  let y = 46
  return (
    <g data-el="legend" data-id="legend" transform={`translate(${at.x} ${at.y})`} style={{ cursor: 'move' }}>
      <rect width={LEGEND_WIDTH} height={h} rx={8} fill={PAPER} stroke="#cbd5e1" />
      <text x={12} y={22} fontSize={12} fontWeight={700} fill={INK}>
        Legend
      </text>
      {rows.types.map((t) => {
        const ry = y
        y += 20
        return (
          <g key={t.type}>
            {t.double ? (
              <>
                <line x1={12} x2={52} y1={ry - 4} y2={ry - 4} stroke={MUTED} strokeWidth={t.width} />
                <line x1={12} x2={52} y1={ry - 4} y2={ry - 4} stroke={PAPER} strokeWidth={t.width / 3} />
              </>
            ) : (
              <line x1={12} x2={52} y1={ry - 4} y2={ry - 4} stroke={MUTED} strokeWidth={t.width} strokeDasharray={t.dash || undefined} />
            )}
            <text x={62} y={ry} fontSize={11} fill={INK}>
              {t.name}
            </text>
          </g>
        )
      })}
      {rows.speeds.map((s) => {
        const ry = y
        y += 20
        return (
          <g key={s.speed || 'none'}>
            <line x1={12} x2={52} y1={ry - 4} y2={ry - 4} stroke={s.color} strokeWidth={4} />
            <text x={62} y={ry} fontSize={11} fill={INK}>
              {s.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}
