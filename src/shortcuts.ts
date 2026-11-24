import { openFile, saveJson } from './io/actions'
import { useEditor } from './model/store'

export const isTyping = (el: Element | null): boolean =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)

export function handleShortcut(e: KeyboardEvent, openHelp: () => void): void {
  if (isTyping(document.activeElement)) return
  const s = useEditor.getState()
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  const run = (fn: () => void) => {
    e.preventDefault()
    fn()
  }
  if (mod) {
    if (key === 'z' && e.shiftKey) return run(s.redo)
    if (key === 'z') return run(s.undo)
    if (key === 'y') return run(s.redo)
    if (key === 'a') return run(s.selectAll)
    if (key === 'c') return run(s.copySelection)
    if (key === 'v') return run(s.paste)
    if (key === 'd') return run(s.duplicateSelection)
    if (key === 'g') return run(s.wrapSelectionInZone)
    if (key === 's') return run(saveJson)
    if (key === 'o') return run(() => void openFile())
    if (key === '=' || key === '+') return run(() => s.zoomBy(1.2))
    if (key === '-') return run(() => s.zoomBy(1 / 1.2))
    return
  }
  if (e.altKey) return
  const step = e.shiftKey ? 32 : 8
  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      return run(s.deleteSelection)
    case 'Escape':
      return run(() => {
        s.setSelection([])
        s.setTool('select')
      })
    case 'ArrowLeft':
      return run(() => s.nudgeSelection(-step, 0))
    case 'ArrowRight':
      return run(() => s.nudgeSelection(step, 0))
    case 'ArrowUp':
      return run(() => s.nudgeSelection(0, -step))
    case 'ArrowDown':
      return run(() => s.nudgeSelection(0, step))
    case '!':
      return run(s.requestFit)
    case '?':
      return run(openHelp)
    case '+':
    case '=':
      return run(() => s.zoomBy(1.2))
    case '-':
      return run(() => s.zoomBy(1 / 1.2))
  }
  if (key === 'v') return run(() => s.setTool('select'))
  if (key === 'c') return run(() => s.setTool(s.tool === 'connect' ? 'select' : 'connect'))
}
