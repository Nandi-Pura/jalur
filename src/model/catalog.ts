import type { DeviceKind } from './types'

export interface DeviceSpec {
  kind: DeviceKind
  name: string
  color: string
  w: number
  h: number
}

export const DEVICE_SPECS: DeviceSpec[] = [
  { kind: 'router', name: 'Router', color: '#2563eb', w: 96, h: 72 },
  { kind: 'switch', name: 'Switch', color: '#0891b2', w: 96, h: 72 },
  { kind: 'firewall', name: 'Firewall', color: '#dc2626', w: 96, h: 72 },
  { kind: 'loadbalancer', name: 'Load balancer', color: '#7c3aed', w: 96, h: 72 },
  { kind: 'server', name: 'Server', color: '#475569', w: 96, h: 72 },
  { kind: 'database', name: 'Database', color: '#b45309', w: 96, h: 72 },
  { kind: 'storage', name: 'Storage', color: '#a16207', w: 96, h: 72 },
  { kind: 'cloud', name: 'Cloud', color: '#0284c7', w: 112, h: 72 },
  { kind: 'internet', name: 'Internet', color: '#0f766e', w: 96, h: 72 },
  { kind: 'accesspoint', name: 'Access point', color: '#16a34a', w: 96, h: 72 },
  { kind: 'pc', name: 'Workstation', color: '#334155', w: 96, h: 72 },
  { kind: 'laptop', name: 'Laptop', color: '#334155', w: 96, h: 72 },
  { kind: 'phone', name: 'IP phone', color: '#334155', w: 96, h: 72 },
  { kind: 'printer', name: 'Printer', color: '#334155', w: 96, h: 72 },
  { kind: 'camera', name: 'Camera', color: '#334155', w: 96, h: 72 },
  { kind: 'generic', name: 'Device', color: '#64748b', w: 96, h: 72 },
]

const byKind = new Map(DEVICE_SPECS.map((s) => [s.kind, s]))

export const specFor = (kind: DeviceKind): DeviceSpec => byKind.get(kind) ?? byKind.get('generic')!

export const isDeviceKind = (v: unknown): v is DeviceKind =>
  typeof v === 'string' && byKind.has(v as DeviceKind)

export const ZONE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#64748b']
