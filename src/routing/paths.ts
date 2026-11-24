import type { Point } from '../model/types'

const EPS = 0.5

/** Drops repeated points and merges collinear runs. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < EPS && Math.abs(last.y - p.y) < EPS) continue
    if (out.length >= 2) {
      const a = out[out.length - 2]
      const b = last!
      const collinear = (Math.abs(a.x - b.x) < EPS && Math.abs(b.x - p.x) < EPS) || (Math.abs(a.y - b.y) < EPS && Math.abs(b.y - p.y) < EPS)
      if (collinear) {
        out[out.length - 1] = p
        continue
      }
    }
    out.push(p)
  }
  return out
}

interface VSeg {
  x: number
  y1: number
  y2: number
}

const fmt = (n: number) => Number(n.toFixed(2))

/**
 * Builds SVG path data for every route. Where a horizontal segment crosses a
 * vertical segment of another route, the horizontal one hops over it with a
 * small semicircle (a "line jump").
 */
export function buildPaths(routes: Map<string, Point[]>, radius = 5): Map<string, string> {
  const simplified = new Map<string, Point[]>()
  for (const [id, pts] of routes) simplified.set(id, simplify(pts))

  const verticals = new Map<string, VSeg[]>()
  for (const [id, pts] of simplified) {
    const segs: VSeg[] = []
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) >= EPS) {
        segs.push({ x: a.x, y1: Math.min(a.y, b.y), y2: Math.max(a.y, b.y) })
      }
    }
    verticals.set(id, segs)
  }

  const paths = new Map<string, string>()
  for (const [id, pts] of simplified) {
    if (pts.length === 0) continue
    const parts = [`M${fmt(pts[0].x)} ${fmt(pts[0].y)}`]
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const horizontal = Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) >= EPS
      if (horizontal) {
        const dir = b.x > a.x ? 1 : -1
        const lo = Math.min(a.x, b.x) + radius
        const hi = Math.max(a.x, b.x) - radius
        const xs: number[] = []
        for (const [otherId, segs] of verticals) {
          if (otherId === id) continue
          for (const v of segs) {
            if (v.x > lo && v.x < hi && a.y > v.y1 + EPS && a.y < v.y2 - EPS) xs.push(v.x)
          }
        }
        xs.sort((p, q) => (p - q) * dir)
        let lastEnd = dir > 0 ? -Infinity : Infinity
        for (const x of xs) {
          const start = x - dir * radius
          if ((start - lastEnd) * dir < 1) continue
          parts.push(`L${fmt(start)} ${fmt(a.y)}`)
          parts.push(`A${radius} ${radius} 0 0 ${dir > 0 ? 1 : 0} ${fmt(x + dir * radius)} ${fmt(a.y)}`)
          lastEnd = x + dir * radius
        }
      }
      parts.push(`L${fmt(b.x)} ${fmt(b.y)}`)
    }
    paths.set(id, parts.join(''))
  }
  return paths
}

export function routeLength(pts: Point[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return len
}

/** The point a given distance along the route, with the direction of travel there. */
export function pointAlong(pts: Point[], dist: number): { p: Point; dx: number; dy: number } {
  if (pts.length === 0) return { p: { x: 0, y: 0 }, dx: 1, dy: 0 }
  let remaining = dist
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len === 0) continue
    const dx = (b.x - a.x) / len
    const dy = (b.y - a.y) / len
    if (remaining <= len || i === pts.length - 1) {
      const t = Math.min(remaining, len)
      return { p: { x: a.x + dx * t, y: a.y + dy * t }, dx, dy }
    }
    remaining -= len
  }
  return { p: pts[0], dx: 1, dy: 0 }
}

export const midpoint = (pts: Point[]) => pointAlong(pts, routeLength(pts) / 2)

/** Where a port name sits: just off the cable, a short way from the device. */
export function portLabelPosition(pts: Point[], atStart: boolean): { x: number; y: number; anchor: 'start' | 'end' | 'middle' } {
  const route = atStart ? pts : [...pts].reverse()
  const { p, dx, dy } = pointAlong(simplify(route), 16)
  if (Math.abs(dx) > Math.abs(dy)) return { x: p.x, y: p.y - 5, anchor: dx > 0 ? 'start' : 'end' }
  return { x: p.x + 5, y: p.y + (dy > 0 ? 6 : 4), anchor: 'start' }
}
