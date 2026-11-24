import { Cable, Download, FilePlus, FolderOpen, Keyboard, Maximize, Moon, MousePointer2, Redo2, Save, Sun, Trash, Undo2, ZoomIn, ZoomOut } from 'lucide'
import { useState } from 'react'
import { exportDrawioFile, exportPng, exportSvg, newDiagram, openFile, saveJson } from '../io/actions'
import { useEditor } from '../model/store'
import type { Point } from '../model/types'
import type { IconNode } from '../icons/icons'
import { Icon } from '../icons/Icon'

interface ToolButtonProps {
  icon: unknown
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}

function ToolButton({ icon, label, onClick, active, disabled }: ToolButtonProps) {
  return (
    <button className={`tool${active ? ' active' : ''}`} title={label} aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}>
      <Icon node={icon as IconNode} size={18} />
    </button>
  )
}

interface ToolbarProps {
  routes: Map<string, Point[]>
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onHelp: () => void
}

export function Toolbar({ routes, theme, onToggleTheme, onHelp }: ToolbarProps) {
  const s = useEditor()
  const [exportOpen, setExportOpen] = useState(false)
  const runExport = (fn: () => unknown) => {
    setExportOpen(false)
    void fn()
  }
  return (
    <header className="toolbar">
      <div className="brand">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M3 6h6v6h6v6h6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
          <circle cx="3" cy="6" r="2.2" fill="currentColor" />
          <circle cx="21" cy="18" r="2.2" fill="currentColor" />
        </svg>
        <span>jalur</span>
      </div>
      <div className="tool-group">
        <ToolButton icon={FilePlus} label="New diagram" onClick={newDiagram} />
        <ToolButton icon={FolderOpen} label="Open (.json or .drawio) — Ctrl+O" onClick={() => void openFile()} />
        <ToolButton icon={Save} label="Save a copy (.json) — Ctrl+S" onClick={saveJson} />
        <div className="menu-wrap">
          <ToolButton icon={Download} label="Export" onClick={() => setExportOpen((o) => !o)} active={exportOpen} />
          {exportOpen && (
            <div className="menu" role="menu" onMouseLeave={() => setExportOpen(false)}>
              <button role="menuitem" onClick={() => runExport(() => exportSvg(routes))}>SVG image (this page)</button>
              <button role="menuitem" onClick={() => runExport(() => exportPng(routes))}>PNG image (this page)</button>
              <button role="menuitem" onClick={() => runExport(exportDrawioFile)}>draw.io file (all pages)</button>
            </div>
          )}
        </div>
      </div>
      <div className="tool-group">
        <ToolButton icon={Undo2} label="Undo — Ctrl+Z" onClick={s.undo} disabled={s.past.length === 0} />
        <ToolButton icon={Redo2} label="Redo — Ctrl+Shift+Z" onClick={s.redo} disabled={s.future.length === 0} />
      </div>
      <div className="tool-group">
        <ToolButton icon={MousePointer2} label="Select — V" onClick={() => s.setTool('select')} active={s.tool === 'select'} />
        <ToolButton icon={Cable} label="Connector — C" onClick={() => s.setTool(s.tool === 'connect' ? 'select' : 'connect')} active={s.tool === 'connect'} />
        <ToolButton icon={Trash} label="Delete selection — Del" onClick={s.deleteSelection} disabled={s.selection.length === 0} />
      </div>
      <div className="tool-group">
        <ToolButton icon={ZoomOut} label="Zoom out — −" onClick={() => s.zoomBy(1 / 1.2)} />
        <span className="zoom-level">{Math.round(s.view.zoom * 100)}%</span>
        <ToolButton icon={ZoomIn} label="Zoom in — +" onClick={() => s.zoomBy(1.2)} />
        <ToolButton icon={Maximize} label="Fit to page — Shift+1" onClick={s.requestFit} />
      </div>
      <div className="spacer" />
      <div className="tool-group">
        <ToolButton icon={Keyboard} label="Keyboard shortcuts — ?" onClick={onHelp} />
        <ToolButton icon={theme === 'dark' ? Sun : Moon} label="Toggle theme" onClick={onToggleTheme} />
      </div>
    </header>
  )
}
