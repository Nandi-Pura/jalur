import type { Avoid, ConnRef, Router, ShapeRef } from 'libavoid-js'
import { center } from '../model/geometry'
import type { Device, Link, Point, Side } from '../model/types'

const PIN_ANY = 1
const SIDE_PIN: Record<Side, number> = { top: 2, right: 3, bottom: 4, left: 5 }
const SIDE_POS: Record<Side, [number, number]> = { top: [0.5, 0], right: [1, 0.5], bottom: [0.5, 1], left: [0, 0.5] }
const SIDES: Side[] = ['top', 'right', 'bottom', 'left']
const PIN_SHIFT = 0.0005
const round = (n: number) => Math.round(n * 10) / 10

interface ShapeEntry {
  ref: ShapeRef
  key: string
}
interface ConnEntry {
  ref: ConnRef
  source: string
  target: string
}

const rectKey = (d: Device) => `${d.x},${d.y},${d.w},${d.h}`

export const ROUTING = {
  shapeBuffer: 12,
  nudging: 10,
  segmentPenalty: 40,
  crossingPenalty: 0,
}

/**
 * Keeps a libavoid router in step with a page: shapes are added, moved and
 * removed incrementally so dragging re-routes only what changed.
 */
export class DiagramRouter {
  private router: Router
  private shapes = new Map<string, ShapeEntry>()
  private conns = new Map<string, ConnEntry>()
  private readonly avoid: Avoid

  constructor(avoid: Avoid) {
    this.avoid = avoid
    this.router = this.createRouter()
  }

  private createRouter(): Router {
    const A = this.avoid
    const r = new A.Router(A.RouterFlag.OrthogonalRouting)
    r.setRoutingParameter(A.RoutingParameter.shapeBufferDistance, ROUTING.shapeBuffer)
    r.setRoutingParameter(A.RoutingParameter.idealNudgingDistance, ROUTING.nudging)
    r.setRoutingParameter(A.RoutingParameter.segmentPenalty, ROUTING.segmentPenalty)
    r.setRoutingParameter(A.RoutingParameter.crossingPenalty, ROUTING.crossingPenalty)
    r.setRoutingOption(A.RoutingOption.nudgeOrthogonalSegmentsConnectedToShapes, true)
    r.setRoutingOption(A.RoutingOption.nudgeSharedPathsWithCommonEndPoint, true)
    r.setRoutingOption(A.RoutingOption.performUnifyingNudgingPreprocessingStep, true)
    return r
  }

  private addShape(d: Device): ShapeEntry {
    const A = this.avoid
    const ref = this.router.addShape({ x: d.x, y: d.y, width: d.w, height: d.h })
    const dir: Record<Side, number> = {
      top: A.ConnDirFlag.ConnDirUp,
      right: A.ConnDirFlag.ConnDirRight,
      bottom: A.ConnDirFlag.ConnDirDown,
      left: A.ConnDirFlag.ConnDirLeft,
    }
    for (const side of SIDES) {
      const [x, y] = SIDE_POS[side]
      ref.addPin({ classId: PIN_ANY, x, y, directions: dir[side] }).setExclusive(false)
      // libavoid drops a route to a pin that shares its exact spot with an
      // earlier pin, so the side-specific pin sits a hair along the side.
      const along = side === 'top' || side === 'bottom'
      ref
        .addPin({ classId: SIDE_PIN[side], x: along ? x + PIN_SHIFT : x, y: along ? y : y + PIN_SHIFT, directions: dir[side] })
        .setExclusive(false)
    }
    return { ref, key: rectKey(d) }
  }

  route(devices: Device[], links: Link[]): Map<string, Point[]> {
    try {
      return this.sync(devices, links)
    } catch (err) {
      console.error('Routing failed, rebuilding the router', err)
      this.reset()
      try {
        return this.sync(devices, links)
      } catch {
        return straightRoutes(devices, links)
      }
    }
  }

  private sync(devices: Device[], links: Link[]): Map<string, Point[]> {
    const deviceMap = new Map(devices.map((d) => [d.id, d]))
    const wanted = new Map<string, Link>()
    for (const l of links) {
      if (l.source.nodeId !== l.target.nodeId && deviceMap.has(l.source.nodeId) && deviceMap.has(l.target.nodeId)) {
        wanted.set(l.id, l)
      }
    }

    for (const [id, c] of this.conns) {
      if (!wanted.has(id)) {
        this.router.deleteConnector(c.ref)
        this.conns.delete(id)
      }
    }
    for (const [id, s] of this.shapes) {
      if (!deviceMap.has(id)) {
        this.router.deleteShape(s.ref)
        this.shapes.delete(id)
      }
    }
    for (const d of devices) {
      const existing = this.shapes.get(d.id)
      if (!existing) this.shapes.set(d.id, this.addShape(d))
      else if (existing.key !== rectKey(d)) {
        this.router.moveShape(existing.ref, { x: d.x, y: d.y, width: d.w, height: d.h })
        existing.key = rectKey(d)
      }
    }
    for (const l of wanted.values()) {
      const source = `${l.source.nodeId}:${l.source.side ?? ''}`
      const target = `${l.target.nodeId}:${l.target.side ?? ''}`
      const srcEnd = { shape: this.shapes.get(l.source.nodeId)!.ref, pin: l.source.side ? SIDE_PIN[l.source.side] : PIN_ANY }
      const dstEnd = { shape: this.shapes.get(l.target.nodeId)!.ref, pin: l.target.side ? SIDE_PIN[l.target.side] : PIN_ANY }
      const existing = this.conns.get(l.id)
      if (!existing) {
        this.conns.set(l.id, { ref: this.router.addConnector(srcEnd, dstEnd), source, target })
        continue
      }
      if (existing.source !== source) {
        existing.ref.setSource(srcEnd)
        existing.source = source
      }
      if (existing.target !== target) {
        existing.ref.setDest(dstEnd)
        existing.target = target
      }
    }

    this.router.processTransaction()

    const routes = new Map<string, Point[]>()
    for (const [id, c] of this.conns) {
      routes.set(
        id,
        c.ref.displayRoute().map((p) => ({ x: round(p.x), y: round(p.y) })),
      )
    }
    return routes
  }

  reset(): void {
    try {
      this.router.delete()
    } catch {
      // The old router may already be unusable.
    }
    this.shapes.clear()
    this.conns.clear()
    this.router = this.createRouter()
  }

  dispose(): void {
    this.router.delete()
    this.shapes.clear()
    this.conns.clear()
  }
}

/** Centre-to-centre lines, used until the wasm router has loaded. */
export function straightRoutes(devices: Device[], links: Link[]): Map<string, Point[]> {
  const map = new Map(devices.map((d) => [d.id, d]))
  const routes = new Map<string, Point[]>()
  for (const l of links) {
    const a = map.get(l.source.nodeId)
    const b = map.get(l.target.nodeId)
    if (a && b && a !== b) routes.set(l.id, [center(a), center(b)])
  }
  return routes
}
