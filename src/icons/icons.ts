import {
  BrickWall,
  Box,
  Cctv,
  Cloud,
  Database,
  Globe,
  HardDrive,
  Laptop,
  Monitor,
  Network,
  Phone,
  Printer,
  Router,
  Server,
  Split,
  Wifi,
} from 'lucide'
import type { DeviceKind } from '../model/types'

export type IconNode = [tag: string, attrs: Record<string, string | number | undefined>][]

export const DEVICE_ICONS: Record<DeviceKind, IconNode> = {
  router: Router as IconNode,
  switch: Network as IconNode,
  firewall: BrickWall as IconNode,
  loadbalancer: Split as IconNode,
  server: Server as IconNode,
  database: Database as IconNode,
  storage: HardDrive as IconNode,
  cloud: Cloud as IconNode,
  internet: Globe as IconNode,
  accesspoint: Wifi as IconNode,
  pc: Monitor as IconNode,
  laptop: Laptop as IconNode,
  phone: Phone as IconNode,
  printer: Printer as IconNode,
  camera: Cctv as IconNode,
  generic: Box as IconNode,
}

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** A standalone SVG document for an icon, for exports. */
export function iconSvgString(node: IconNode, color: string, size = 48): string {
  const children = node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
        .join(' ')
      return `<${tag} ${a}/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${escapeAttr(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
}
