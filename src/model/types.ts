export type Side = 'top' | 'right' | 'bottom' | 'left'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type DeviceKind =
  | 'router'
  | 'switch'
  | 'firewall'
  | 'server'
  | 'database'
  | 'storage'
  | 'cloud'
  | 'internet'
  | 'loadbalancer'
  | 'accesspoint'
  | 'pc'
  | 'laptop'
  | 'phone'
  | 'printer'
  | 'camera'
  | 'generic'

export interface Device extends Rect {
  id: string
  kind: DeviceKind
  label: string
  sublabel: string
  zoneId: string | null
}

export interface Zone extends Rect {
  id: string
  label: string
  color: string
}

export type LinkType = 'ethernet' | 'fiber' | 'lag' | 'wireless' | 'vpn' | 'serial'
export type LinkSpeed = '' | '100M' | '1G' | '10G' | '25G' | '40G' | '100G' | '400G'

export interface LinkEnd {
  nodeId: string
  /** null lets the router pick the side; a side fastens the cable to it. */
  side: Side | null
  port: string
}

export interface Link {
  id: string
  source: LinkEnd
  target: LinkEnd
  type: LinkType
  speed: LinkSpeed
  label: string
}

export interface Page {
  id: string
  name: string
  devices: Device[]
  zones: Zone[]
  links: Link[]
  showLegend: boolean
  legend: Point
}

export interface DiagramDoc {
  format: 'jalur'
  version: 1
  title: string
  pages: Page[]
  activePageId: string
}

export type ElementKind = 'device' | 'zone' | 'link' | 'legend'
