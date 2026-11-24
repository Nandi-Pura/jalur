import { AvoidLib } from 'libavoid-js'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Device, Link } from '../model/types'
import { DiagramRouter } from './router'

const dev = (id: string, x: number, y: number): Device => ({ id, kind: 'server', label: id, sublabel: '', zoneId: null, x, y, w: 96, h: 72 })
const link = (id: string, a: string, b: string, side: Link['source']['side'] = null): Link => ({
  id,
  source: { nodeId: a, side, port: '' },
  target: { nodeId: b, side: null, port: '' },
  type: 'ethernet',
  speed: '',
  label: '',
})

const isOrthogonal = (pts: { x: number; y: number }[]) =>
  pts.every((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) < 0.01 || Math.abs(p.y - pts[i - 1].y) < 0.01)

describe('DiagramRouter', () => {
  let router: DiagramRouter
  beforeAll(async () => {
    await AvoidLib.load()
    router = new DiagramRouter(AvoidLib.getInstance())
  })

  it('routes orthogonally around an obstacle', () => {
    const devices = [dev('a', 0, 0), dev('blocker', 200, 0), dev('b', 400, 0)]
    const routes = router.route(devices, [link('l1', 'a', 'b')])
    const pts = routes.get('l1')!
    expect(pts.length).toBeGreaterThan(2)
    expect(isOrthogonal(pts)).toBe(true)
    const crossesBlocker = pts.some((p, i) => i > 0 && Math.min(p.y, pts[i - 1].y) < 72 && Math.max(p.y, pts[i - 1].y) > 0 && p.x > 200 && p.x < 296)
    expect(crossesBlocker).toBe(false)
  })

  it('re-routes incrementally when a device moves or is removed', () => {
    const devices = [dev('a', 0, 0), dev('b', 400, 300)]
    const first = router.route(devices, [link('l1', 'a', 'b')]).get('l1')!
    const moved = router.route([devices[0], { ...devices[1], x: 600 }], [link('l1', 'a', 'b')]).get('l1')!
    expect(moved[moved.length - 1].x).not.toBe(first[first.length - 1].x)
    const none = router.route([devices[0]], [])
    expect(none.size).toBe(0)
  })

  it('fastens an end to the requested side', () => {
    const devices = [dev('a', 0, 0), dev('b', 400, 0)]
    const pts = router.route(devices, [link('l1', 'a', 'b', 'top')]).get('l1')!
    expect(pts[0]).toEqual({ x: 48, y: 0 })
    expect(pts[1].y).toBeLessThan(0)
  })
})
