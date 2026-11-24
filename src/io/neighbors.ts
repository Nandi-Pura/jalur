import { specFor } from '../model/catalog'
import { assignZones } from '../model/doc'
import { boundsOf, LEGEND_WIDTH, snap } from '../model/geometry'
import { newId } from '../model/ids'
import type { Device, DeviceKind, Link, LinkSpeed, Page } from '../model/types'

/** One adjacency read from `show cdp/lldp neighbors` output. */
export interface Neighbor {
  local: string
  localPort: string
  remote: string
  remotePort: string
  kind: DeviceKind | null
  platform: string
  address: string
}

export interface ParseResult {
  neighbors: Neighbor[]
  /** Devices the commands were run on, in the order they appear. */
  locals: string[]
  /** True when some output had no prompt line and no fallback name was given. */
  missingLocal: boolean
}

const PROMPT = /^\s*(?:[\w.-]+@)?([A-Za-z0-9_.()-]+)\s*[#>%]\s*(?:sh\w*|display)\s+(?:cdp|lldp)\b.*$/gim
const IFACE = '[A-Za-z][A-Za-z-]*\\s?\\d[\\w/.:-]*'
const IPV4 = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/
const MAC = /^([0-9a-f]{2}[:.-]?){5}[0-9a-f]{2}$|^([0-9a-f]{4}\.){2}[0-9a-f]{4}$/i

/** Short host name: no domain, no NX-OS serial suffix, no stray quotes. */
export function hostKey(name: string): string {
  return displayHost(name).toLowerCase()
}

export function displayHost(name: string): string {
  const n = name.trim().replace(/^"|"$/g, '').replace(/\([^)]*\)$/, '')
  if (/^[\d.]+$/.test(n) || MAC.test(n)) return n
  return n.split('.')[0]
}

const IF_ABBREV: [RegExp, string][] = [
  [/^fourhundredgig[a-z]*|^fou(?=\s?\d)/i, 'FH'],
  [/^hundredgig[a-z]*|^hun(?=\s?\d)|^hu(?=\d)/i, 'Hu'],
  [/^fortygig[a-z]*|^for(?=\s?\d)|^fo(?=\d)/i, 'Fo'],
  [/^twentyfivegig[a-z]*|^twe(?=\s?\d)/i, 'Twe'],
  [/^tengig[a-z]*|^ten(?=\s?\d)|^te(?=\d)/i, 'Te'],
  [/^gigabitethernet|^gig(?=\s?\d)|^gi(?=\d)/i, 'Gi'],
  [/^fastethernet|^fas(?=\s?\d)|^fa(?=\d)/i, 'Fa'],
  [/^port-channel|^po(?=\d)/i, 'Po'],
  // Case-sensitive so Linux `eth0` stays as is.
  [/^Ethernet|^Eth(?=\s?\d)|^Et(?=\d)/, 'Eth'],
]

/** Canonical short interface name, so "GigabitEthernet1/0/1" and "Gig 1/0/1" match. */
export function shortIface(name: string): string {
  const n = name.trim().replace(/^"|"$/g, '')
  for (const [re, short] of IF_ABBREV) {
    if (re.test(n)) return short + n.replace(re, '').replace(/^\s+/, '')
  }
  return n
}

const SPEED_BY_PREFIX: [RegExp, LinkSpeed][] = [
  [/^FH\d/, '400G'],
  [/^Hu\d|^et-/, '100G'],
  [/^Fo\d/, '40G'],
  [/^Twe\d/, '25G'],
  [/^Te\d|^xe-/, '10G'],
  [/^Gi\d|^ge-/, '1G'],
  [/^Fa\d|^fe-/, '100M'],
]

export function speedOf(port: string): LinkSpeed {
  const p = shortIface(port)
  for (const [re, speed] of SPEED_BY_PREFIX) if (re.test(p)) return speed
  return ''
}

export const isBundle = (port: string): boolean => /^(Po|ae|Bundle-Ether)\d/i.test(shortIface(port))

/** Guesses a device kind from capability codes/words and the platform string. */
export function inferKind(caps: string, platform: string, protocol: 'cdp' | 'lldp'): DeviceKind | null {
  const p = platform
  if (/\bAIR-|Aironet|access point|\bC91\d\d|\bMR\d\d|\bAP\d/i.test(p)) return 'accesspoint'
  if (/phone|\bCP-\d|\bSEP[0-9A-F]{6}/i.test(p)) return 'phone'
  if (/\bASA|Firepower|\bFPR|FortiGate|\bFGT|\bPA-\d|Palo Alto|\bSRX|Sophos|SonicWall/i.test(p)) return 'firewall'
  if (/\bISR|\bASR|\bCISCO\d{4}|\bC8[0-9]{3}|\bMX\d|\bvEdge|router/i.test(p)) return 'router'
  if (/\bWS-C|Catalyst|\bC9[2-6]\d\d|\bN\dK|Nexus|\bDCS-|Arista|\bEX\d|\bQFX|switch/i.test(p)) return 'switch'

  const words = caps.toLowerCase()
  const codes = new Set(words.split(/[\s,]+/).filter((c) => c.length === 1))
  const has = (word: string, code: string) => words.includes(word) || codes.has(code) || codes.has(code.toLowerCase())
  if (has('phone', 'P') && protocol === 'cdp') return 'phone'
  if (protocol === 'lldp' && (words.includes('telephone') || codes.has('t'))) return 'phone'
  if (protocol === 'lldp' && (words.includes('wlan') || codes.has('w'))) return 'accesspoint'
  if (/\bswitch\b|bridge/.test(words) || (codes.has('s') && protocol === 'cdp') || codes.has('b')) return 'switch'
  if (has('router', 'R')) return 'router'
  if (words.includes('host') || codes.has('h') || (protocol === 'lldp' && (words.includes('station') || codes.has('s')))) return 'server'
  return null
}

function field(entry: string, re: RegExp): string {
  return entry.match(re)?.[1]?.trim() ?? ''
}

function parseCdpDetail(text: string, local: string): Neighbor[] {
  return text
    .split(/(?=^\s*Device ID\s*:)/im)
    .filter((e) => /^\s*Device ID\s*:/i.test(e))
    .flatMap((e) => {
      const remote = field(e, /Device ID\s*:\s*(\S+)/i)
      const m = e.match(/Interface\s*:\s*([^,\n]+),\s*Port ID \(outgoing port\)\s*:\s*(.+)/i)
      if (!remote || !m) return []
      const platform = field(e, /Platform\s*:\s*([^,\n]+)/i).replace(/^cisco\s+/i, '')
      const caps = field(e, /Capabilities\s*:\s*(.+)/i)
      return [{
        local,
        localPort: m[1].trim(),
        remote,
        remotePort: m[2].trim(),
        kind: inferKind(caps, platform, 'cdp'),
        platform,
        address: field(e, /(?:IP(?:v4)? address|Mgmt address)\s*:\s*(\d[\d.]+)/i),
      }]
    })
}

function parseLldpDetail(text: string, local: string): Neighbor[] {
  const entries = /^\s*-{10,}\s*$/m.test(text) ? text.split(/^\s*-{10,}\s*$/m) : text.split(/(?=^\s*Chassis id\s*:)/im)
  return entries.flatMap((e) => {
    const localPort = field(e, /^\s*Local (?:Intf|Port id|Interface)\s*:\s*(\S+)/im)
    let remotePort = field(e, /^\s*Port id\s*:\s*(\S+)/im)
    const desc = field(e, /^\s*Port Description\s*:\s*(.+)/im)
    if (desc && (!remotePort || MAC.test(remotePort))) remotePort = desc
    const remote = field(e, /^\s*System Name\s*:\s*(\S+)/im) || field(e, /^\s*Chassis id\s*:\s*(\S+)/im)
    if (!localPort || !remote) return []
    const sysDesc = e.match(/System Description\s*:\s*(.*)\n\s*(.*)/i)
    const platform = (sysDesc ? sysDesc[1] || sysDesc[2] : '').trim()
    const caps = field(e, /Enabled Capabilities\s*:\s*(.+)/i) || field(e, /System Capabilities\s*:\s*(.+)/i)
    return [{
      local,
      localPort,
      remote,
      remotePort,
      kind: inferKind(caps, platform, 'lldp'),
      platform: platform.length > 40 ? '' : platform,
      address: field(e, /(?:\bIP|Management Address(?:es)?|Mgmt address)\s*:\s*(\d{1,3}(?:\.\d{1,3}){3})/i),
    }]
  })
}

/** Summary tables: Cisco IOS/NX-OS CDP and LLDP, Arista and Junos LLDP. */
function parseTable(text: string, local: string): Neighbor[] {
  const lines = text.split(/\r?\n/)
  const out: Neighbor[] = []
  const headerAt = lines.findIndex((l) => /Local\s+Intr?f/i.test(l) || /Neighbor Device ID/i.test(l) || /Local Interface.*System Name/i.test(l))
  if (headerAt < 0) return out
  const header = lines[headerAt]
  const isCdp = /Platform/i.test(header)
  const arista = /Neighbor Device ID/i.test(header)
  const junos = /System Name/i.test(header) && /Chassis Id/i.test(header)
  const localCol = header.search(/Local\s+Intr?f/i)
  const [chassisCol, portCol, nameCol] = [/Chassis Id/i, /Port info/i, /System Name/i].map((re) => header.search(re))
  const rowRe = isCdp
    ? new RegExp(`^(${IFACE})\\s+(\\d+)\\s+((?:[A-Za-z]\\s+)*)(.*?)\\s+(${IFACE}|\\S+)\\s*$`)
    : new RegExp(`^(${IFACE})\\s+(\\d+)\\s+(?:([A-Za-z,]+)\\s+)?(\\S.*?)\\s*$`)
  let pendingName = ''
  for (const raw of lines.slice(headerAt + 1)) {
    if (!raw.trim() || /^\s*-+(\s+-+)*\s*$/.test(raw) || /^Total|entries displayed|^Capability codes/i.test(raw.trim())) continue
    if (arista || junos) {
      const t = raw.trim().split(/\s+/)
      if (arista && t.length >= 3) out.push(row(local, t[0], t[1], t[2], '', ''))
      if (junos && t.length >= 2) {
        // Port info can contain spaces and System Name can be blank, so read Junos rows by column.
        const remote = raw.slice(nameCol).trim() || raw.slice(chassisCol, portCol).trim()
        const port = raw.slice(portCol, nameCol).trim()
        if (remote && port) out.push(row(local, t[0], remote, port, '', ''))
      }
      continue
    }
    const name = localCol > 0 ? raw.slice(0, localCol).trim() : ''
    const rest = localCol > 0 ? raw.slice(localCol).trim() : raw.trim()
    if (!/\s/.test(raw.trim())) {
      pendingName = raw.trim() // long Device IDs wrap onto their own line
      continue
    }
    // A Device ID longer than its column pushes the rest of the row to the right.
    const spill = !rowRe.test(rest) && raw.trim().match(/^(\S+)\s+(.*)$/)
    const device = spill ? spill[1] : name || pendingName
    const m = (spill ? spill[2] : rest).match(rowRe)
    pendingName = ''
    if (!device || !m) continue
    if (isCdp) out.push(row(local, m[1], device, m[5], m[3], m[4], 'cdp'))
    else out.push(row(local, m[1], device, m[4], m[3] ?? '', '', 'lldp'))
  }
  return out
}

function row(local: string, localPort: string, remote: string, remotePort: string, caps: string, platform: string, protocol: 'cdp' | 'lldp' = 'lldp'): Neighbor {
  return { local, localPort, remote, remotePort, kind: inferKind(caps, platform, protocol), platform: platform.trim(), address: '' }
}

function parseSection(text: string, local: string): Neighbor[] {
  if (/^\s*Device ID\s*:/im.test(text)) return parseCdpDetail(text, local)
  if (/^\s*(?:System Name|Chassis id)\s*:/im.test(text)) return parseLldpDetail(text, local)
  return parseTable(text, local)
}

/**
 * Parses pasted neighbor output from one or more devices. Each device's output
 * should start with its prompt (`CORE-01#show cdp neighbors detail`); output
 * without a prompt is attributed to `fallbackLocal`.
 */
export function parseNeighbors(text: string, fallbackLocal = ''): ParseResult {
  const sections: { local: string; body: string }[] = []
  let last = 0
  let local = fallbackLocal.trim()
  for (const m of text.matchAll(PROMPT)) {
    sections.push({ local, body: text.slice(last, m.index) })
    local = m[1]
    last = m.index! + m[0].length
  }
  sections.push({ local, body: text.slice(last) })

  const neighbors: Neighbor[] = []
  const locals: string[] = []
  let missingLocal = false
  for (const s of sections) {
    const found = parseSection(s.body, s.local)
    if (!found.length) continue
    if (!s.local) {
      missingLocal = true
      continue
    }
    if (!locals.some((l) => hostKey(l) === hostKey(s.local))) locals.push(s.local)
    neighbors.push(...found)
  }
  return { neighbors, locals, missingLocal }
}

export interface MergeResult {
  page: Page
  newDevices: number
  newLinks: number
  /** Ids of the devices and cables added or touched, for selecting them afterwards. */
  ids: string[]
}

/** Placement tier: edge devices on top, then the switching layer, then endpoints. */
const TIER: Partial<Record<DeviceKind, number>> = { firewall: 0, router: 0, switch: 1 }
const GAP_X = 160
const GAP_Y = 168

/**
 * Adds the devices and cables described by `neighbors` to a page. Devices are
 * matched by host name and cables by their two ends, so pasting both sides of a
 * link, or pasting again later, does not create duplicates.
 */
export function mergeNeighbors(page: Page, { neighbors, locals }: Pick<ParseResult, 'neighbors' | 'locals'>): MergeResult {
  const byKey = new Map(page.devices.map((d) => [hostKey(d.label), d]))
  const fresh = new Map<string, { label: string; kind: DeviceKind | null; sublabel: string }>()
  const touched = new Set<string>()

  const note = (name: string, kind: DeviceKind | null, platform: string, address: string) => {
    const key = hostKey(name)
    if (!key) return
    const sublabel = address || platform
    const existing = byKey.get(key)
    if (existing) {
      touched.add(existing.id)
      return
    }
    const f = fresh.get(key)
    if (!f) fresh.set(key, { label: displayHost(name), kind, sublabel })
    else {
      f.kind ??= kind
      if (!f.sublabel || (address && !IPV4.test(f.sublabel))) f.sublabel = sublabel
    }
  }
  for (const l of locals) note(l, null, '', '')
  for (const n of neighbors) note(n.remote, n.kind, n.platform, n.address)

  const devices: Device[] = page.devices.slice()
  const filled = new Map<string, Device>()
  for (const d of page.devices) {
    const info = neighbors.find((n) => hostKey(n.remote) === hostKey(d.label))
    const sublabel = info ? info.address || info.platform : ''
    if (!d.sublabel && sublabel) filled.set(d.id, { ...d, sublabel })
  }

  const tiers = new Map<number, { label: string; kind: DeviceKind; sublabel: string; key: string }[]>()
  for (const [key, f] of fresh) {
    const kind = f.kind ?? (locals.some((l) => hostKey(l) === key) ? 'switch' : 'generic')
    const tier = TIER[kind] ?? 2
    tiers.set(tier, [...(tiers.get(tier) ?? []), { ...f, kind, key }])
  }
  const bounds = boundsOf(page.devices)
  const top = bounds ? bounds.y + bounds.h + GAP_Y : 80
  // On an empty page, start beside the legend rather than under it.
  const left = bounds ? bounds.x : page.showLegend ? page.legend.x + LEGEND_WIDTH + 80 : 80
  const widest = Math.max(0, ...[...tiers.values()].map((t) => t.length))
  ;[...tiers.keys()].sort().forEach((tier, row) => {
    const items = tiers.get(tier)!
    const offset = ((widest - items.length) * GAP_X) / 2
    items.forEach((item, i) => {
      const spec = specFor(item.kind)
      const device: Device = {
        id: newId('dev'),
        kind: item.kind,
        label: item.label,
        sublabel: item.sublabel,
        zoneId: null,
        x: snap(left + offset + i * GAP_X),
        y: snap(top + row * GAP_Y),
        w: spec.w,
        h: spec.h,
      }
      devices.push(device)
      byKey.set(item.key, device)
      touched.add(device.id)
    })
  })

  const links: Link[] = page.links.slice()
  const portKey = (nodeId: string, port: string) => `${nodeId}|${shortIface(port).toLowerCase()}`
  let newLinks = 0
  for (const n of neighbors) {
    const a = byKey.get(hostKey(n.local))
    const b = byKey.get(hostKey(n.remote))
    if (!a || !b || a.id === b.id) continue
    const ends = [portKey(a.id, n.localPort), portKey(b.id, n.remotePort)]
    const same = links.findIndex((l) => {
      const pair = [l.source, l.target]
      if (!pair.some((e) => e.nodeId === a.id) || !pair.some((e) => e.nodeId === b.id)) return false
      const keys = pair.map((e) => portKey(e.nodeId, e.port))
      // One shared end is enough: a port has one cable, and remote port ids differ between formats (MAC vs name).
      return pair.every((e) => !e.port) || keys.some((k) => ends.includes(k))
    })
    if (same >= 0) {
      const l = links[same]
      const portFor = (nodeId: string, current: string) => (current && !MAC.test(current) ? current : shortIface(nodeId === a.id ? n.localPort : n.remotePort))
      links[same] = { ...l, source: { ...l.source, port: portFor(l.source.nodeId, l.source.port) }, target: { ...l.target, port: portFor(l.target.nodeId, l.target.port) } }
      touched.add(l.id)
      continue
    }
    const id = newId('link')
    links.push({
      id,
      source: { nodeId: a.id, side: null, port: shortIface(n.localPort) },
      target: { nodeId: b.id, side: null, port: shortIface(n.remotePort) },
      type: isBundle(n.localPort) ? 'lag' : 'ethernet',
      speed: speedOf(n.localPort) || speedOf(n.remotePort),
      label: '',
    })
    touched.add(id)
    newLinks++
  }

  const merged = assignZones(
    { ...page, devices: devices.map((d) => filled.get(d.id) ?? d), links },
    new Set(devices.slice(page.devices.length).map((d) => d.id)),
  )
  return { page: merged, newDevices: devices.length - page.devices.length, newLinks, ids: [...touched] }
}
