import { emptyDoc } from './doc'
import type { Device, DeviceKind, DiagramDoc, Link, LinkSpeed, LinkType, Side, Zone } from './types'

const dev = (id: string, kind: DeviceKind, label: string, x: number, y: number, zoneId: string | null = null, sublabel = ''): Device => ({
  id,
  kind,
  label,
  sublabel,
  zoneId,
  x,
  y,
  w: kind === 'cloud' ? 112 : 96,
  h: 72,
})

let linkSeq = 0
const link = (
  a: string,
  b: string,
  type: LinkType,
  speed: LinkSpeed,
  ports: [string, string] = ['', ''],
  sides: [Side | null, Side | null] = [null, null],
): Link => ({
  id: `link_s${++linkSeq}`,
  source: { nodeId: a, side: sides[0], port: ports[0] },
  target: { nodeId: b, side: sides[1], port: ports[1] },
  type,
  speed,
  label: '',
})

/** A small campus network shown on first start. */
export function sampleDoc(): DiagramDoc {
  linkSeq = 0
  const doc = emptyDoc('Campus network')
  const page = doc.pages[0]
  const zones: Zone[] = [
    { id: 'zone_dmz', label: 'DMZ', color: '#f59e0b', x: 600, y: 120, w: 280, h: 160 },
    { id: 'zone_dc', label: 'Data centre', color: '#3b82f6', x: 80, y: 520, w: 520, h: 180 },
  ]
  const devices: Device[] = [
    dev('d_inet', 'internet', 'Internet', 352, 0),
    dev('d_fw1', 'firewall', 'FW-01', 240, 152, null, '10.0.0.1'),
    dev('d_fw2', 'firewall', 'FW-02', 464, 152, null, '10.0.0.2'),
    dev('d_web', 'server', 'WEB-01', 640, 168, 'zone_dmz'),
    dev('d_mail', 'server', 'MAIL-01', 768, 168, 'zone_dmz'),
    dev('d_core1', 'switch', 'CORE-01', 240, 336),
    dev('d_core2', 'switch', 'CORE-02', 464, 336),
    dev('d_srv1', 'server', 'APP-01', 112, 576, 'zone_dc'),
    dev('d_srv2', 'server', 'APP-02', 240, 576, 'zone_dc'),
    dev('d_db', 'database', 'DB-01', 368, 576, 'zone_dc'),
    dev('d_nas', 'storage', 'NAS-01', 480, 576, 'zone_dc'),
    dev('d_ap', 'accesspoint', 'AP-01', 720, 400),
  ]
  const links: Link[] = [
    link('d_inet', 'd_fw1', 'serial', '1G'),
    link('d_inet', 'd_fw2', 'serial', '1G'),
    link('d_fw1', 'd_fw2', 'ethernet', '1G', ['ha0', 'ha0']),
    link('d_fw2', 'd_web', 'ethernet', '1G'),
    link('d_fw2', 'd_mail', 'ethernet', '1G'),
    link('d_fw1', 'd_core1', 'fiber', '10G', ['port3', 'Te1/0/1']),
    link('d_fw2', 'd_core2', 'fiber', '10G', ['port3', 'Te1/0/1']),
    link('d_fw1', 'd_core2', 'fiber', '10G'),
    link('d_fw2', 'd_core1', 'fiber', '10G'),
    link('d_core1', 'd_core2', 'lag', '100G', ['Po1', 'Po1'], ['right', 'left']),
    link('d_core1', 'd_srv1', 'ethernet', '10G'),
    link('d_core1', 'd_srv2', 'ethernet', '10G'),
    link('d_core2', 'd_db', 'ethernet', '25G'),
    link('d_core2', 'd_nas', 'ethernet', '25G'),
    link('d_core1', 'd_db', 'ethernet', '25G'),
    link('d_core2', 'd_ap', 'wireless', '1G'),
  ]
  page.name = 'Overview'
  page.zones = zones
  page.devices = devices
  page.links = links
  page.legend = { x: 720, y: 520 }
  return doc
}
