import { describe, expect, it } from 'vitest'
import { buildPaths, midpoint, simplify } from './paths'

describe('simplify', () => {
  it('merges collinear points and drops duplicates', () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
  })
})

describe('buildPaths', () => {
  it('adds a jump where a horizontal segment crosses a vertical one', () => {
    const routes = new Map([
      ['h', [{ x: 0, y: 50 }, { x: 100, y: 50 }]],
      ['v', [{ x: 40, y: 0 }, { x: 40, y: 100 }]],
    ])
    const paths = buildPaths(routes, 5)
    expect(paths.get('h')).toBe('M0 50L35 50A5 5 0 0 1 45 50L100 50')
    expect(paths.get('v')).toBe('M40 0L40 100')
  })

  it('jumps the other way when travelling left and ignores touching ends', () => {
    const routes = new Map([
      ['h', [{ x: 100, y: 50 }, { x: 0, y: 50 }]],
      ['v', [{ x: 60, y: 0 }, { x: 60, y: 100 }]],
      ['t', [{ x: 20, y: 50 }, { x: 20, y: 100 }]],
    ])
    expect(buildPaths(routes, 5).get('h')).toBe('M100 50L65 50A5 5 0 0 0 55 50L0 50')
  })

  it('finds the midpoint of a polyline', () => {
    expect(midpoint([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]).p).toEqual({ x: 10, y: 0 })
  })
})
