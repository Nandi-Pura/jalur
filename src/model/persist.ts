import { parseDoc, serializeDoc } from '../io/json'
import { notify } from './notify'
import { sampleDoc } from './sample'
import { useEditor } from './store'
import type { DiagramDoc } from './types'

const KEY = 'jalur:autosave'
const BACKUP_KEY = 'jalur:autosave:overwritten'

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** The saved content without the active page, so switching pages alone is not an edit. */
const contentOf = (json: string | null): string | null => {
  if (!json) return null
  try {
    const { activePageId: _ignored, ...rest } = JSON.parse(json) as DiagramDoc
    return JSON.stringify(rest)
  } catch {
    return null
  }
}

let lastSynced: string | null = null

export function loadInitialDoc(): DiagramDoc {
  const raw = read(KEY)
  if (raw) {
    try {
      const doc = parseDoc(raw)
      lastSynced = contentOf(raw)
      return doc
    } catch {
      // A corrupt autosave should never block the editor from opening.
    }
  }
  const sample = sampleDoc()
  lastSynced = contentOf(serializeDoc(sample))
  return sample
}

/**
 * Debounced autosave to localStorage, flushed when the page is hidden or closed.
 * Tabs share one slot: an untouched tab adopts another tab's saves, and a tab that
 * overwrites someone else's newer save keeps it in a backup slot.
 */
export function startAutosave(delay = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = false

  const flush = () => {
    clearTimeout(timer)
    if (!pending) return
    pending = false
    const json = serializeDoc(useEditor.getState().doc)
    const content = contentOf(json)
    if (content === lastSynced) return
    const stored = read(KEY)
    if (stored && contentOf(stored) !== lastSynced) {
      if (!write(BACKUP_KEY, stored)) {
        notify('Another tab changed this diagram and browser storage is full — not auto-saving. Use Save to keep a copy.', 'error')
        return
      }
      notify('Another tab changed this diagram too; its version was kept as a backup in this browser.', 'error')
    }
    if (write(KEY, json)) lastSynced = content
    else notify('Browser storage is full — auto-save failed. Use Save to keep a copy.', 'error')
  }

  const unsub = useEditor.subscribe((s, prev) => {
    if (s.doc === prev.doc) return
    pending = true
    clearTimeout(timer)
    timer = setTimeout(flush, delay)
  })

  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY || !e.newValue) return
    const content = contentOf(e.newValue)
    if (content === lastSynced) return
    const mine = contentOf(serializeDoc(useEditor.getState().doc))
    if (mine !== lastSynced) return // local edits pending; flush() will keep a backup of theirs
    try {
      const doc = parseDoc(e.newValue)
      const active = useEditor.getState().doc.activePageId
      useEditor.getState().adoptDoc(doc.pages.some((p) => p.id === active) ? { ...doc, activePageId: active } : doc)
      lastSynced = content
      pending = false
    } catch {
      // Ignore unreadable writes from other tabs.
    }
  }
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush()
  }

  window.addEventListener('storage', onStorage)
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onHide)
  return () => {
    flush()
    unsub()
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onHide)
  }
}
