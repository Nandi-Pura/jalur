import { Plus, X } from 'lucide'
import { useState } from 'react'
import { useEditor } from '../model/store'
import type { IconNode } from '../icons/icons'
import { Icon } from '../icons/Icon'
import type { RouterStatus } from '../routing/useRoutes'

export function PageTabs({ status }: { status: RouterStatus }) {
  const doc = useEditor((s) => s.doc)
  const { setActivePage, addPage, deletePage, renamePage } = useEditor.getState()
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const finish = () => {
    if (renaming?.name.trim()) renamePage(renaming.id, renaming.name.trim())
    setRenaming(null)
  }
  return (
    <footer className="pagebar">
      <div className="tabs" role="tablist">
        {doc.pages.map((p) => (
          <div key={p.id} className={`tab${p.id === doc.activePageId ? ' active' : ''}`} role="tab" aria-selected={p.id === doc.activePageId} onClick={() => setActivePage(p.id)} onDoubleClick={() => setRenaming({ id: p.id, name: p.name })}>
            {renaming?.id === p.id ? (
              <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} onBlur={finish} onKeyDown={(e) => {
                if (e.key === 'Enter') finish()
                if (e.key === 'Escape') setRenaming(null)
                e.stopPropagation()
              }} />
            ) : (
              <span>{p.name}</span>
            )}
            {doc.pages.length > 1 && (
              <button className="tab-close" aria-label={`Delete ${p.name}`} onClick={(e) => {
                e.stopPropagation()
                if (window.confirm(`Delete page "${p.name}"?`)) deletePage(p.id)
              }}>
                <Icon node={X as IconNode} size={12} />
              </button>
            )}
          </div>
        ))}
        <button className="tab add" aria-label="Add page" title="Add page" onClick={addPage}>
          <Icon node={Plus as IconNode} size={14} />
        </button>
      </div>
      <div className={`status status-${status}`}>
        {status === 'ready' ? 'Routing: libavoid' : status === 'loading' ? 'Loading router…' : 'Router unavailable — straight lines'}
        {' · '}Auto-saved in this browser
      </div>
    </footer>
  )
}
