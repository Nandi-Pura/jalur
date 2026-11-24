import { useMemo, useState } from 'react'
import { mergeNeighbors, parseNeighbors } from '../io/neighbors'
import { activePage } from '../model/doc'
import { notify } from '../model/notify'
import { useEditor } from '../model/store'

const EXAMPLE = `CORE-01#show cdp neighbors
Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID
ACC-01           Ten 1/1/1         155             S I    WS-C2960X Ten 1/0/1
ACC-02           Ten 1/1/2         160             S I    WS-C2960X Ten 1/0/1
EDGE-RTR         Gig 1/0/48        150           R B S I  ISR4331/K Gig 0/0/1

ACC-01#show lldp neighbors
Device ID           Local Intf     Hold-time  Capability      Port ID
CORE-01             Te1/0/1        120        B,R             Te1/1/1
ap-lobby            Gi1/0/10       120        W               Gi0
`

/** Turns pasted `show cdp/lldp neighbors` output into devices and cables on the current page. */
export function NeighborsDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [fallback, setFallback] = useState('')
  const page = useEditor((s) => activePage(s.doc))
  const parsed = useMemo(() => parseNeighbors(text, fallback), [text, fallback])
  const preview = useMemo(() => mergeNeighbors(page, parsed), [page, parsed])

  const summary = !text.trim()
    ? 'Paste the output of one or more devices, each starting with its prompt line.'
    : parsed.neighbors.length === 0
      ? parsed.missingLocal
        ? 'Found neighbors, but not which device they belong to: add the prompt line or a device name.'
        : 'No CDP or LLDP neighbors recognized.'
      : `${parsed.neighbors.length} neighbor entries from ${parsed.locals.length} device(s): ${preview.newDevices} new devices, ${preview.newLinks} new cables.` +
        (parsed.missingLocal ? ' Some output has no prompt line and will be skipped — add one or a device name.' : '')

  const run = () => {
    const { editPage, requestFit } = useEditor.getState()
    const result = mergeNeighbors(activePage(useEditor.getState().doc), parsed)
    editPage(() => result.page, result.ids)
    if (result.newDevices) requestFit()
    notify(`Imported ${result.newDevices} devices and ${result.newLinks} cables.`)
    onClose()
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Import CDP/LLDP neighbors" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>Import CDP/LLDP neighbors</h2>
        <p className="meta">
          Supports <code>show cdp neighbors [detail]</code> and <code>show lldp neighbors [detail]</code> from Cisco IOS/NX-OS, plus Arista and Junos LLDP tables. Devices and cables already on the page are reused.
        </p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} spellCheck={false} autoFocus aria-label="Neighbor output" />
        <label className="field">
          <span>Device name for output without a prompt line</span>
          <input value={fallback} onChange={(e) => setFallback(e.target.value)} placeholder="e.g. CORE-01" />
        </label>
        <div className="dialog-actions">
          <span className="meta" role="status">{summary}</span>
          {!text && <button className="btn" onClick={() => setText(EXAMPLE)}>Use example</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={run} disabled={parsed.neighbors.length === 0}>Import</button>
        </div>
      </div>
    </div>
  )
}
