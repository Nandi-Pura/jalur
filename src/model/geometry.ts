import type { Page, Point, Rect, Side } from './types'

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

export const containsPoint = (r: Rect, p: Point): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

export const containsRect = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h

export const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

export function sideAnchor(r: Rect, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: r.x + r.w / 2, y: r.y }
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h }
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 }
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 }
  }
}

/**
 * The side a point is close to, or null when it is near the middle of the
 * rectangle (which leaves the side to the router).
 */
export function nearestSide(r: Rect, p: Point, middleFraction = 0.3): Side | null {
  const c = center(r)
  const nx = (p.x - c.x) / (r.w / 2)
  const ny = (p.y - c.y) / (r.h / 2)
  if (Math.abs(nx) < middleFraction && Math.abs(ny) < middleFraction) return null
  if (Math.abs(nx) > Math.abs(ny)) return nx > 0 ? 'right' : 'left'
  return ny > 0 ? 'bottom' : 'top'
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.w)
    y2 = Math.max(y2, r.y + r.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function pointsBounds(points: Point[]): Rect | null {
  return boundsOf(points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })))
}

export const LEGEND_WIDTH = 180

export function legendHeight(rows: number): number {
  return rows === 0 ? 0 : 34 + rows * 20
}

/** Bounds of everything drawn on a page, used for fit-to-view and export. */
export function pageBounds(page: Page, routes: Map<string, Point[]>, legendRowsCount: number): Rect | null {
  const rects: Rect[] = [...page.devices, ...page.zones]
  for (const pts of routes.values()) {
    const b = pointsBounds(pts)
    if (b) rects.push(b)
  }
  if (page.showLegend && legendRowsCount > 0) {
    rects.push({ x: page.legend.x, y: page.legend.y, w: LEGEND_WIDTH, h: legendHeight(legendRowsCount) })
  }
  return boundsOf(rects)
}

export const snap = (v: number, grid = 8): number => Math.round(v / grid) * grid
