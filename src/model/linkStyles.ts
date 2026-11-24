import type { Link, LinkSpeed, LinkType, Page } from './types'

export interface LinkTypeSpec {
  type: LinkType
  name: string
  width: number
  dash: string
  /** Drawn as two parallel strokes. */
  double: boolean
}

export const LINK_TYPES: LinkTypeSpec[] = [
  { type: 'ethernet', name: 'Ethernet', width: 2, dash: '', double: false },
  { type: 'fiber', name: 'Fiber', width: 3, dash: '', double: false },
  { type: 'lag', name: 'LAG / bundle', width: 6, dash: '', double: true },
  { type: 'wireless', name: 'Wireless', width: 2, dash: '2 5', double: false },
  { type: 'vpn', name: 'VPN / tunnel', width: 2, dash: '9 5', double: false },
  { type: 'serial', name: 'Serial / WAN', width: 2, dash: '12 4 2 4', double: false },
]

export const LINK_SPEEDS: { speed: LinkSpeed; name: string; color: string }[] = [
  { speed: '', name: 'Unspecified', color: '#64748b' },
  { speed: '100M', name: '100 Mb/s', color: '#a8a29e' },
  { speed: '1G', name: '1 Gb/s', color: '#2563eb' },
  { speed: '10G', name: '10 Gb/s', color: '#16a34a' },
  { speed: '25G', name: '25 Gb/s', color: '#0891b2' },
  { speed: '40G', name: '40 Gb/s', color: '#9333ea' },
  { speed: '100G', name: '100 Gb/s', color: '#dc2626' },
  { speed: '400G', name: '400 Gb/s', color: '#ea580c' },
]

const typeMap = new Map(LINK_TYPES.map((t) => [t.type, t]))
const speedMap = new Map(LINK_SPEEDS.map((s) => [s.speed, s]))

export const linkTypeSpec = (t: LinkType): LinkTypeSpec => typeMap.get(t) ?? typeMap.get('ethernet')!
export const speedColor = (s: LinkSpeed): string => speedMap.get(s)?.color ?? '#64748b'
export const speedName = (s: LinkSpeed): string => speedMap.get(s)?.name ?? s
export const isLinkType = (v: unknown): v is LinkType => typeof v === 'string' && typeMap.has(v as LinkType)
export const isLinkSpeed = (v: unknown): v is LinkSpeed => typeof v === 'string' && speedMap.has(v as LinkSpeed)

export interface LegendRows {
  types: LinkTypeSpec[]
  speeds: { speed: LinkSpeed; name: string; color: string }[]
}

/** The legend lists only the link types and speeds the page actually uses. */
export function legendRows(page: Pick<Page, 'links'>): LegendRows {
  const usedTypes = new Set<LinkType>(page.links.map((l: Link) => l.type))
  const usedSpeeds = new Set<LinkSpeed>(page.links.map((l: Link) => l.speed))
  return {
    types: LINK_TYPES.filter((t) => usedTypes.has(t.type)),
    speeds: LINK_SPEEDS.filter((s) => usedSpeeds.has(s.speed)),
  }
}
