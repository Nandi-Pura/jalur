import { describe, expect, it } from 'vitest'
import { emptyPage } from '../model/doc'
import { inferKind, mergeNeighbors, parseNeighbors, shortIface, speedOf } from './neighbors'

const CDP_DETAIL = `CORE-01#show cdp neighbors detail
-------------------------
Device ID: ACC-01.corp.local
Entry address(es): 
  IP address: 10.0.0.11
Platform: cisco WS-C2960X-48FPD-L,  Capabilities: Switch IGMP 
Interface: TenGigabitEthernet1/1/1,  Port ID (outgoing port): TenGigabitEthernet1/0/1
Holdtime : 155 sec

-------------------------
Device ID: SEP001122334455
Entry address(es): 
  IP address: 10.0.5.20
Platform: Cisco IP Phone 8851,  Capabilities: Host Phone Two-port Mac Relay 
Interface: GigabitEthernet1/0/5,  Port ID (outgoing port): Port 1
Holdtime : 140 sec

Total cdp entries displayed : 2
`

const CDP_TABLE = `ACC-01>sh cdp nei
Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge
                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone

Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID
CORE-01.corp.local
                 Ten 1/0/1         171             R S I  WS-C3850- Ten 1/1/1
EDGE-RTR         Gig 1/0/48        150              R B S I ISR4331/K Gig 0/0/1

Total cdp entries displayed : 2
`

const LLDP_DETAIL = `------------------------------------------------
Local Intf: Gi1/0/2
Chassis id: 00aa.bbcc.dd01
Port id: 00aa.bbcc.dd01
Port Description: eth0
System Name: web-01

System Description: 
Ubuntu 22.04 LTS Linux 5.15.0

Time remaining: 100 seconds
System Capabilities: B,R,S
Enabled Capabilities: S
Management Addresses:
    IP: 10.0.10.21
`

const NXOS_LLDP_TABLE = `nx-agg-01# show lldp neighbors
Capability codes:
  (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device
Device ID            Local Intf      Hold-time  Capability  Port ID  
fw-01                Eth1/1          120        R           port3
ap-lobby             Eth1/10         120        W           Gi0
Total entries displayed: 2
`

describe('parseNeighbors', () => {
  it('reads CDP detail with the prompt as the local device', () => {
    const r = parseNeighbors(CDP_DETAIL)
    expect(r.locals).toEqual(['CORE-01'])
    expect(r.neighbors).toHaveLength(2)
    expect(r.neighbors[0]).toMatchObject({ local: 'CORE-01', localPort: 'TenGigabitEthernet1/1/1', remote: 'ACC-01.corp.local', remotePort: 'TenGigabitEthernet1/0/1', kind: 'switch', address: '10.0.0.11' })
    expect(r.neighbors[1].kind).toBe('phone')
  })

  it('reads CDP tables, including wrapped device ids', () => {
    const r = parseNeighbors(CDP_TABLE)
    expect(r.neighbors.map((n) => [n.remote, n.localPort, n.remotePort])).toEqual([
      ['CORE-01.corp.local', 'Ten 1/0/1', 'Ten 1/1/1'],
      ['EDGE-RTR', 'Gig 1/0/48', 'Gig 0/0/1'],
    ])
    expect(r.neighbors[1].kind).toBe('router')
  })

  it('reads LLDP detail and NX-OS LLDP tables', () => {
    const d = parseNeighbors(LLDP_DETAIL, 'CORE-01')
    expect(d.neighbors[0]).toMatchObject({ local: 'CORE-01', localPort: 'Gi1/0/2', remote: 'web-01', remotePort: 'eth0', kind: 'server', address: '10.0.10.21' })
    const t = parseNeighbors(NXOS_LLDP_TABLE)
    expect(t.neighbors.map((n) => [n.local, n.remote, n.localPort, n.remotePort, n.kind])).toEqual([
      ['nx-agg-01', 'fw-01', 'Eth1/1', 'port3', 'router'],
      ['nx-agg-01', 'ap-lobby', 'Eth1/10', 'Gi0', 'accesspoint'],
    ])
  })

  it('flags output without a prompt or fallback name', () => {
    const r = parseNeighbors(LLDP_DETAIL)
    expect(r.neighbors).toHaveLength(0)
    expect(r.missingLocal).toBe(true)
  })
})

describe('helpers', () => {
  it('normalizes interface names and speeds', () => {
    expect(shortIface('GigabitEthernet1/0/1')).toBe('Gi1/0/1')
    expect(shortIface('Gig 1/0/1')).toBe('Gi1/0/1')
    expect(shortIface('Ten 1/1/1')).toBe('Te1/1/1')
    expect(shortIface('Ethernet1/49')).toBe('Eth1/49')
    expect(speedOf('TenGigabitEthernet1/1/1')).toBe('10G')
    expect(speedOf('ge-0/0/1')).toBe('1G')
    expect(speedOf('port3')).toBe('')
  })

  it('infers kinds from platforms before capabilities', () => {
    expect(inferKind('Router Switch IGMP', 'ISR4331/K9', 'cdp')).toBe('router')
    expect(inferKind('R S I', 'N9K-C93180YC-EX', 'cdp')).toBe('switch')
    expect(inferKind('', 'FortiGate-100F', 'lldp')).toBe('firewall')
    expect(inferKind('B', '', 'lldp')).toBe('switch')
  })
})

describe('mergeNeighbors', () => {
  it('creates devices and cables once, even when both sides are pasted', () => {
    const r = parseNeighbors(CDP_DETAIL + '\n' + CDP_TABLE)
    const m = mergeNeighbors(emptyPage('P'), r)
    expect(m.page.devices.map((d) => d.label).sort()).toEqual(['ACC-01', 'CORE-01', 'EDGE-RTR', 'SEP001122334455'])
    expect(m.newLinks).toBe(3)
    const uplink = m.page.links.find((l) => l.source.port === 'Te1/1/1' || l.target.port === 'Te1/1/1')!
    expect(uplink.speed).toBe('10G')
    expect(m.page.devices.find((d) => d.label === 'ACC-01')!.sublabel).toBe('10.0.0.11')

    const again = mergeNeighbors(m.page, r)
    expect(again.newDevices).toBe(0)
    expect(again.newLinks).toBe(0)
  })

  it('reuses existing devices and fills ports on matching blank cables', () => {
    const first = mergeNeighbors(emptyPage('P'), { neighbors: [], locals: ['CORE-01', 'ACC-01'] })
    const [core, acc] = first.page.devices
    const page = { ...first.page, links: [{ id: 'l1', source: { nodeId: core.id, side: null, port: '' }, target: { nodeId: acc.id, side: null, port: '' }, type: 'ethernet' as const, speed: '' as const, label: '' }] }
    const m = mergeNeighbors(page, parseNeighbors(CDP_DETAIL))
    expect(m.newLinks).toBe(1) // the phone; the uplink reuses l1
    const l1 = m.page.links.find((l) => l.id === 'l1')!
    expect([l1.source.port, l1.target.port]).toEqual(['Te1/1/1', 'Te1/0/1'])
  })
})

describe('review fixes', () => {
  it('keeps unnamed neighbors with similar chassis MACs apart', () => {
    const entry = (port: string, mac: string) => `------------------------------------------------\nLocal Intf: ${port}\nChassis id: ${mac}\nPort id: ${mac}\n`
    const r = parseNeighbors(entry('Gi1/0/1', '00aa.bbcc.dd01') + entry('Gi1/0/2', '00aa.bbcc.dd02'), 'SW1')
    const m = mergeNeighbors(emptyPage('P'), r)
    expect(m.newDevices).toBe(3)
    expect(m.newLinks).toBe(2)
  })
})

describe('junos lldp table', () => {
  it('reads multiword ports and rows without a system name', () => {
    const text = `admin@mx-01> show lldp neighbors
Local Interface    Parent Interface    Chassis Id          Port info          System Name
ge-0/0/0           -                   00:11:22:33:44:55   ge-0/0/1           ex-01
ge-0/0/1           -                   00:11:22:33:44:66   Ethernet 1         
ge-0/0/2           -                   00:11:22:33:44:77   eth0               web-02
`
    const r = parseNeighbors(text)
    expect(r.neighbors.map((n) => [n.local, n.localPort, n.remote, n.remotePort])).toEqual([
      ['mx-01', 'ge-0/0/0', 'ex-01', 'ge-0/0/1'],
      ['mx-01', 'ge-0/0/1', '00:11:22:33:44:66', 'Ethernet 1'],
      ['mx-01', 'ge-0/0/2', 'web-02', 'eth0'],
    ])
  })
})

describe('mixed lldp formats', () => {
  it('does not duplicate a cable when the remote port id is a MAC in one format', () => {
    const table = `CORE-01#show lldp neighbors
Device ID           Local Intf     Hold-time  Capability      Port ID
web-01              Gi1/0/2        120        S               00aa.bbcc.dd01
`
    const first = mergeNeighbors(emptyPage('P'), parseNeighbors(table))
    const second = mergeNeighbors(first.page, parseNeighbors(LLDP_DETAIL, 'CORE-01'))
    expect(second.newLinks).toBe(0)
    const l = second.page.links[0]
    expect([l.source.port, l.target.port]).toEqual(['Gi1/0/2', 'eth0'])
  })
})

describe('parallel lldp cables', () => {
  it('keeps two cables whose remote ports share a description', () => {
    const entry = (port: string, mac: string) => `------------------------------------------------\nLocal Intf: ${port}\nChassis id: 00aa.bbcc.0001\nPort id: ${mac}\nPort Description: uplink\nSystem Name: srv-01\n`
    const r = parseNeighbors(entry('Gi1/0/1', '00aa.bbcc.dd01') + entry('Gi1/0/2', '00aa.bbcc.dd02'), 'SW1')
    expect(mergeNeighbors(emptyPage('P'), r).newLinks).toBe(2)
  })
})
