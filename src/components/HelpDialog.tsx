const SHORTCUTS: [string, string][] = [
  ['V / C', 'Select tool / connector tool'],
  ['Drag from a handle', 'Draw a cable from that side'],
  ['Double-click', 'Rename device, zone, cable or page'],
  ['Shift + click', 'Add to or remove from selection'],
  ['Ctrl + A', 'Select everything on the page'],
  ['Arrow keys', 'Nudge selection (Shift = 32 px)'],
  ['Delete / Backspace', 'Delete selection'],
  ['Ctrl + C / V / D', 'Copy / paste / duplicate'],
  ['Ctrl + Z / Ctrl + Shift + Z', 'Undo / redo'],
  ['Ctrl + G', 'Wrap selected devices in a zone'],
  ['Ctrl + S / Ctrl + O', 'Save a copy / open a file'],
  ['Space + drag, scroll', 'Pan'],
  ['Ctrl + scroll, + / −', 'Zoom'],
  ['Shift + 1', 'Fit page to window'],
  ['Alt while dragging', 'Move without grid snapping'],
  ['Esc', 'Cancel / clear selection'],
]

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <table>
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k}>
                <td><kbd>{k}</kbd></td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="meta">Your work is saved automatically in this browser. Use Save to keep a file copy.</p>
        <button className="btn" onClick={onClose} autoFocus>Close</button>
      </div>
    </div>
  )
}
