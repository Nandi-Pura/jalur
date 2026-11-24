import { describe, expect, it } from 'vitest'
import { cableRows, cablesCsv, tracePath } from './cables'
import { emptyPage } from './doc'
import type { Device, Link, Page } from './types'

const dev = (id: string, label = id): Device => ({ id, kind: 'switch', label, sublabel: '', zoneId: null, x: 0, y: 0, w: 96, h: 72 })
const link = (id: string, a: string, b: string, extra: Partial<Link> = {}): Link => ({
  id,
  source: { nodeId: a, side: null, port: '' },
  target: { nodeId: b, side: null, port: '' },
  type: 'ethernet',
  speed: '',
  label: '',
  ...extra,
})
const page = (devices: Device[], links: Link[]): Page => ({ ...emptyPage('P'), devices, links })

describe('cable schedule', () => {
  it('numbers cables and resolves names, ports and zones', () => {
    const p = page([{ ...dev('a', 'CORE'), zoneId: 'z' }, dev('b', 'ACC')], [
      link('l1', 'a', 'b', { speed: '10G', type: 'fiber', source: { nodeId: 'a', side: null, port: 'Te1/1/1' } }),
    ])
    p.zones = [{ id: 'z', label: 'DC', color: '#000', x: 0, y: 0, w: 1, h: 1 }]
    expect(cableRows(p)[0]).toMatchObject({ cable: 'C001', from: 'CORE', fromPort: 'Te1/1/1', fromZone: 'DC', to: 'ACC', type: 'Fiber', speed: '10 Gb/s' })
  })

  it('escapes CSV quotes, commas and formula prefixes', () => {
    const p = page([dev('a', 'A, "main"'), dev('b', '=cmd')], [link('l1', 'a', 'b')])
    const line = cablesCsv(cableRows(p)).split('\r\n')[1]
    expect(line).toBe(`P,C001,"A, ""main""",,,'=cmd,,,Ethernet,,`)
  })
})

describe('trace path', () => {
  const p = page([dev('a'), dev('b'), dev('c'), dev('d'), dev('e')], [
    link('ab', 'a', 'b'),
    link('bc', 'b', 'c'),
    link('cd', 'c', 'd'),
    link('ad', 'd', 'a'),
  ])

  it('finds the path with the fewest cables, in either cable direction', () => {
    expect(tracePath(p, 'a', 'c')).toEqual({ deviceIds: ['a', 'b', 'c'], linkIds: ['ab', 'bc'] })
    expect(tracePath(p, 'a', 'd')).toEqual({ deviceIds: ['a', 'd'], linkIds: ['ad'] })
  })

  it('returns null for unconnected devices', () => {
    expect(tracePath(p, 'a', 'e')).toBeNull()
  })
})
