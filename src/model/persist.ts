import { parseDoc, serializeDoc } from '../io/json'
import { sampleDoc } from './sample'
import { useEditor } from './store'
import type { DiagramDoc } from './types'

const KEY = 'jalur:autosave'

export function loadInitialDoc(): DiagramDoc {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return parseDoc(raw)
  } catch {
    // A corrupt autosave should never block the editor from opening.
  }
  return sampleDoc()
}

/** Writes the document to localStorage shortly after each change. Returns an unsubscribe. */
export function startAutosave(delay = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const unsub = useEditor.subscribe((s, prev) => {
    if (s.doc === prev.doc) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, serializeDoc(useEditor.getState().doc))
      } catch {
        // Storage full or disabled; the user can still save to a file.
      }
    }, delay)
  })
  return () => {
    clearTimeout(timer)
    unsub()
  }
}
