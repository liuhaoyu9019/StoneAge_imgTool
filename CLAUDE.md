# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start dev server at 0.0.0.0:5173
- `npm run build` — Production build to `dist/` (target es2015)
- `npm run preview` — Preview production build locally
- Deploy via PM2: `pm2 start ecosystem.config.json`

## Architecture

**Stack:** Vite 5 + React 18, no routing (single-page app), no UI framework, no CSS framework.

**Layout:** Two-column — left panel (FileUpload + IdListPanel with virtual scroll) at 328px, right panel (PreviewPanel) fills remaining space.

**Data flow:**

1. User uploads paired `.bin` files (adrn+real for static sprites, spradrn+spr for animations) via drag-drop or click
2. Web Worker (`public/parser.worker.js`) parses adrn/spradrn index in a background thread, returning paginated results (500 items/page)
3. `src/parsers/staticParser.js` handles all binary parsing: adrn/spradrn index reading, JSS-RLE decompression, SAP palette parsing, RGB565 pixel conversion, static image and animation frame loading via Canvas API
4. `src/parsers/refPalettes.js` is a 1.8MB lookup table of in-game palettes
5. 16 SAP palette files in `public/palettes/` are loaded at startup
6. Exports (PNG, BMP, GIF, ZIP) are handled client-side via Canvas and `jszip`/`gif.js`

**Key files:**

- `src/App.jsx` — State management hub (616 lines): file validation, parsing orchestration, image loading, animation control, selection/export logic
- `src/components/FileUpload.jsx` — Drag-drop upload with naming convention validation
- `src/components/IdListPanel.jsx` — Virtual-scrolled list with search (numeric ID auto-scroll), multi-select, batch export
- `src/components/PreviewPanel.jsx` — StaticPreview (zoomable canvas) and AnimationPreview (frame player with speed control)
- `src/components/UIComponents.jsx` — Toast, LoadingSpinner, HelpPanel, ConfirmDialog
- `src/utils/exportUtils.js` — ZIP packing, blob download, filename generation
- `src/utils/fileReader.js` — Blob slicing, chunked reading, RGB565→RGBA conversion
- `src/parsers/staticParser.js` — Core binary format parser (JSS-RLE, SAP, adrn/spradrn)

**No tests, no linting, no formatting config exists.**
