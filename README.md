# jalur

Offline-first network diagram editor with self-routing orthogonal connectors (React + TS + libavoid).

## Features

- Device palette (16 types) — click or drag onto the canvas
- Cables route themselves around devices (libavoid, orthogonal) and re-route when anything moves
- Line jumps where cables cross
- Fasten a cable end to a side of a device, or leave it on auto
- Link type (line style) and speed (colour), with a legend generated from what the page uses
- Port labels at each cable end, cable labels
- Zones: moving a zone moves the devices inside it
- Pan/zoom, marquee selection, snapping, copy/paste/duplicate, undo/redo
- Multiple pages per diagram
- Auto-save in the browser; save/open `.jalur.json`
- Import/export draw.io (`.drawio`, compressed or plain)
- Export SVG / PNG
- Light/dark theme, keyboard shortcuts (press `?`)

## Development

Requires Node 20+.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # routing + path unit tests
npm run lint
npm run build    # static site in dist/
```

The build is a static site; host `dist/` anywhere. `libavoid.wasm` is emitted as an asset next to the JS bundle.

## Licence notes

`libavoid-js` (the router) is LGPL-2.1 and is loaded as a separate wasm file.
