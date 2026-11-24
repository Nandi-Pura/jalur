import type { Avoid } from 'libavoid-js'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Page, Point } from '../model/types'
import { loadAvoid } from './avoid'
import { DiagramRouter, straightRoutes } from './router'

export type RouterStatus = 'loading' | 'ready' | 'failed'

/** Routes for the page's links; straight lines until libavoid has loaded. */
export function useRoutes(page: Page): { routes: Map<string, Point[]>; status: RouterStatus } {
  const [avoid, setAvoid] = useState<Avoid | null>(null)
  const [status, setStatus] = useState<RouterStatus>('loading')
  const routerRef = useRef<DiagramRouter | null>(null)

  useEffect(() => {
    let alive = true
    loadAvoid()
      .then((a) => {
        if (!alive) return
        setAvoid(a)
        setStatus('ready')
      })
      .catch((err) => {
        console.error('Could not load libavoid', err)
        if (alive) setStatus('failed')
      })
    return () => {
      alive = false
    }
  }, [])

  const routes = useMemo(() => {
    if (!avoid) return straightRoutes(page.devices, page.links)
    routerRef.current ??= new DiagramRouter(avoid)
    return routerRef.current.route(page.devices, page.links)
  }, [avoid, page.devices, page.links])

  return { routes, status }
}

/** Routes every page of a document with a throwaway router, for exports. */
export async function routeAllPages(pages: Page[]): Promise<Map<string, Map<string, Point[]>>> {
  const out = new Map<string, Map<string, Point[]>>()
  let avoid: Avoid | null = null
  try {
    avoid = await loadAvoid()
  } catch {
    avoid = null
  }
  for (const page of pages) {
    if (!avoid) {
      out.set(page.id, straightRoutes(page.devices, page.links))
      continue
    }
    const router = new DiagramRouter(avoid)
    out.set(page.id, router.route(page.devices, page.links))
    router.dispose()
  }
  return out
}
