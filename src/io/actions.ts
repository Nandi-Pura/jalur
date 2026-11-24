import { cablesCsv, docCableRows } from '../model/cables'
import { activePage } from '../model/doc'
import { pageBounds } from '../model/geometry'
import { legendRows } from '../model/linkStyles'
import { notify } from '../model/notify'
import { useEditor } from '../model/store'
import type { Point } from '../model/types'
import { routeAllPages } from '../routing/useRoutes'
import { exportDrawio, importDrawio } from './drawio'
import { buildSvg, svgToPng } from './exportImage'
import { downloadBlob, pickFile, safeFileName } from './files'
import { parseDoc, serializeDoc } from './json'

const isEmpty = () => useEditor.getState().doc.pages.every((p) => p.devices.length === 0 && p.zones.length === 0)
const confirmDiscard = () =>
  isEmpty() || window.confirm('Replace the current diagram? It is only kept in this browser — use Save first if you want a copy.')

export function saveJson(): void {
  const { doc } = useEditor.getState()
  downloadBlob(`${safeFileName(doc.title)}.jalur.json`, new Blob([serializeDoc(doc)], { type: 'application/json' }))
  notify('Saved a copy to your downloads')
}

export async function openFile(): Promise<void> {
  const file = await pickFile('.json,.jalur,.drawio,.xml,application/json,application/xml')
  if (!file) return
  await openFromFile(file)
}

export async function openFromFile(file: File): Promise<void> {
  try {
    const text = await file.text()
    const isXml = /\.(drawio|xml)$/i.test(file.name) || text.trimStart().startsWith('<')
    const doc = isXml ? await importDrawio(text, file.name.replace(/\.(drawio|xml)$/i, '')) : parseDoc(text)
    if (!confirmDiscard()) return
    useEditor.getState().loadDoc(doc)
    useEditor.getState().requestFit()
    notify(`Opened ${file.name}`)
  } catch (err) {
    notify(`Could not open ${file.name}: ${(err as Error).message}`, 'error')
  }
}

export function newDiagram(): void {
  if (!confirmDiscard()) return
  useEditor.getState().newDoc()
  useEditor.getState().requestFit()
}

function currentSvg(routes: Map<string, Point[]>): string | null {
  const page = activePage(useEditor.getState().doc)
  const rows = legendRows(page)
  const b = pageBounds(page, routes, rows.types.length + rows.speeds.length)
  if (!b) {
    notify('The page is empty — nothing to export', 'error')
    return null
  }
  return buildSvg(b)
}

const exportName = () => {
  const { doc } = useEditor.getState()
  const page = activePage(doc)
  return safeFileName(doc.pages.length > 1 ? `${doc.title}-${page.name}` : doc.title)
}

export function exportSvg(routes: Map<string, Point[]>): void {
  const svg = currentSvg(routes)
  if (svg) downloadBlob(`${exportName()}.svg`, new Blob([svg], { type: 'image/svg+xml' }))
}

export async function exportPng(routes: Map<string, Point[]>): Promise<void> {
  const svg = currentSvg(routes)
  if (!svg) return
  try {
    downloadBlob(`${exportName()}.png`, await svgToPng(svg))
  } catch (err) {
    notify(`PNG export failed: ${(err as Error).message}`, 'error')
  }
}

export async function exportDrawioFile(): Promise<void> {
  const { doc } = useEditor.getState()
  const routes = await routeAllPages(doc.pages)
  downloadBlob(`${safeFileName(doc.title)}.drawio`, new Blob([exportDrawio(doc, routes)], { type: 'application/xml' }))
}

export function exportCablesCsv(): void {
  const { doc } = useEditor.getState()
  const rows = docCableRows(doc)
  if (rows.length === 0) return notify('There are no cables to export yet.')
  downloadBlob(`${safeFileName(doc.title)}-cables.csv`, new Blob(['\ufeff' + cablesCsv(rows)], { type: 'text/csv' }))
}
