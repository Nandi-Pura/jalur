import { useEffect, useState } from 'react'
import { Canvas } from './components/Canvas'
import { HelpDialog } from './components/HelpDialog'
import { Inspector } from './components/Inspector'
import { PageTabs } from './components/PageTabs'
import { Palette } from './components/Palette'
import { Toasts } from './components/Toasts'
import { Toolbar } from './components/Toolbar'
import { openFromFile } from './io/actions'
import { activePage } from './model/doc'
import { loadInitialDoc, startAutosave } from './model/persist'
import { useEditor } from './model/store'
import { useRoutes } from './routing/useRoutes'
import { handleShortcut } from './shortcuts'

type Theme = 'light' | 'dark'
const THEME_KEY = 'jalur:theme'

const readTheme = (): string | null => {
  try {
    return localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
}

const initialTheme = (): Theme => {
  const saved = readTheme()
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let booted = false
function boot() {
  if (booted) return
  booted = true
  useEditor.getState().loadDoc(loadInitialDoc())
  useEditor.getState().requestFit()
}

export default function App() {
  boot()
  const page = useEditor((s) => activePage(s.doc))
  const title = useEditor((s) => s.doc.title)
  const { routes, status } = useRoutes(page)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [help, setHelp] = useState(false)

  useEffect(() => startAutosave(), [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Storage blocked: the theme still applies for this visit.
    }
  }, [theme])
  useEffect(() => {
    document.title = `${title} · jalur`
  }, [title])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleShortcut(e, () => setHelp(true))
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onDropFile = (e: React.DragEvent) => {
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    e.preventDefault()
    void openFromFile(file)
  }

  return (
    <div className="app" onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()} onDrop={onDropFile}>
      <Toolbar routes={routes} theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} onHelp={() => setHelp(true)} />
      <Palette />
      <main className="stage">
        <Canvas routes={routes} />
      </main>
      <Inspector />
      <PageTabs status={status} />
      <Toasts />
      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  )
}
