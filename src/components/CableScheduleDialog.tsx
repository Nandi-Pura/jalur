import { useState } from 'react'
import { exportCablesCsv } from '../io/actions'
import { cableRows, docCableRows } from '../model/cables'
import { activePage } from '../model/doc'
import { useEditor } from '../model/store'

/** Every cable as a table; clicking a row selects the cable on the canvas. */
export function CableScheduleDialog({ onClose }: { onClose: () => void }) {
  const doc = useEditor((s) => s.doc)
  const [all, setAll] = useState(false)
  const rows = all ? docCableRows(doc) : cableRows(activePage(doc))
  const show = (pageId: string, id: string) => {
    const { setActivePage, setSelection } = useEditor.getState()
    setActivePage(pageId)
    setSelection([id])
    onClose()
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog wide schedule" role="dialog" aria-modal="true" aria-label="Cable schedule" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>Cable schedule</h2>
        <label className="check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} autoFocus /> All pages
        </label>
        {rows.length === 0 ? (
          <p className="meta">No cables {all ? 'in this diagram' : 'on this page'} yet.</p>
        ) : (
          <div className="schedule-scroll">
            <table>
              <thead>
                <tr>
                  {all && <th>Page</th>}
                  <th>Cable</th>
                  <th>From</th>
                  <th>Port</th>
                  <th>To</th>
                  <th>Port</th>
                  <th>Type</th>
                  <th>Speed</th>
                  <th>Label</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => show(r.pageId, r.id)} title="Show on the canvas">
                    {all && <td>{r.page}</td>}
                    <td>{r.cable}</td>
                    <td>{r.from}</td>
                    <td>{r.fromPort}</td>
                    <td>{r.to}</td>
                    <td>{r.toPort}</td>
                    <td>{r.type}</td>
                    <td>{r.speed}</td>
                    <td>{r.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="dialog-actions">
          <span className="meta">{rows.length} cable{rows.length === 1 ? '' : 's'} · click a row to show it</span>
          <button className="btn" onClick={exportCablesCsv} disabled={docCableRows(doc).length === 0}>Export CSV (all pages)</button>
          <button className="btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
