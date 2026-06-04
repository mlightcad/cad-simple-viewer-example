# CAD Simple Viewer Example

A vanilla TypeScript demo that shows how to embed [`@mlightcad/cad-simple-viewer`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-viewer) in a web page: open DXF/DWG files, create a sample drawing, register custom commands, and lazy-load HTML/PDF/SVG export plugins.

[**Live demo**](https://mlightcad.github.io/cad-simple-viewer-example/)

## Features

- **Local files** — Open `.dxf` / `.dwg` via the file picker
- **New drawing** — Create a sample drawing with predefined entities (`DocCreator`)
- **Custom command** — Demo ellipse command (`ellipsedemo`)
- **Lazy export plugins** — HTML (`chtml`), PDF (`cpdf`), SVG (`csvg`) load on first use
- **Browser-only** — Parsing and rendering run in the browser (Web Workers + WebAssembly for DWG)

## Prerequisites

- Node.js **≥ 20** and pnpm **≥ 10**

## Getting started

```bash
pnpm install
pnpm dev      # Vite dev server (default http://localhost:5173)
pnpm build    # Typecheck + production build
pnpm preview  # Serve dist/
```

The build copies parser workers and `viewer-runtime.iife.js` into `dist/assets/` (see `vite.config.ts`).

## Usage

1. Start the dev server and open the URL shown in the terminal.
2. **Open** — Choose a `.dxf` or `.dwg` file, or click **New** to create the sample drawing.
3. After a file is opened successfully, **HTML**, **PDF**, and **SVG** export buttons appear. Plugins are fetched on first export, so the first run may take a moment.
4. Run the custom ellipse command from the viewer command line: `ellipsedemo`.

Toast messages at the top report success or errors. The window title updates when a document is activated.

## Supported formats

| Format | Notes |
|--------|--------|
| **DXF** | Parsed in a Web Worker (`dxf-parser-worker.js`) |
| **DWG** | LibreDWG WebAssembly via `libredwg-parser-worker.js` |

## Plugin system (HTML / PDF / SVG export)

Export commands moved out of `cad-simple-viewer` into separate npm packages. This example registers them **lazily** so they are not in the initial bundle until the user exports.

| Package | Plugin name | Trigger commands | Purpose |
|---------|-------------|------------------|---------|
| `@mlightcad/cad-html-plugin` | `HtmlPlugin` | `chtml` | Export drawing to offline HTML |
| `@mlightcad/cad-pdf-plugin` | `PdfPlugin` | `cpdf`, `ipdf` | Export to PDF / import vector PDF |
| `@mlightcad/cad-svg-plugin` | `SvgPlugin` | `csvg` | Export drawing to SVG |

See the [Plugin System wiki](https://github.com/mlightcad/cad-viewer/wiki/Plugin-System) for how to build and register your own plugins.

### Registration (this example)

After `AcApDocManager.createInstance()`, register lazy plugins on `pluginManager`:

```typescript
import { registerLazyHtmlPlugin } from '@mlightcad/cad-html-plugin'
import { registerLazyPdfPlugin } from '@mlightcad/cad-pdf-plugin'
import { registerLazySvgPlugin } from '@mlightcad/cad-svg-plugin'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'

AcApDocManager.createInstance({
  container: document.getElementById('cad-container')!,
  autoResize: true,
  webworkerFileUrls: {
    mtextRender: './assets/mtext-renderer-worker.js',
    dxfParser: './assets/dxf-parser-worker.js',
    dwgParser: './assets/libredwg-parser-worker.js'
  },
  // Required for HTML export — must match where viewer-runtime.iife.js is served
  htmlViewerRuntimeUrl: './assets/viewer-runtime.iife.js'
})

const pm = AcApDocManager.instance.pluginManager
registerLazyHtmlPlugin(pm)
registerLazyPdfPlugin(pm)
registerLazySvgPlugin(pm)
```

### Run export commands

After a document is loaded, trigger export via UI or API:

```typescript
AcApDocManager.instance.sendStringToExecute('chtml')
AcApDocManager.instance.sendStringToExecute('cpdf')
AcApDocManager.instance.sendStringToExecute('csvg')
```

`sendStringToExecute` loads the matching lazy plugin automatically on first use. You do not need to call `loadByTrigger` unless you want to preload before execution.

### Static assets for HTML export

HTML export embeds `viewer-runtime.iife.js` from `@mlightcad/cad-html-plugin` (not from `cad-simple-viewer`). Copy it next to your workers and set `htmlViewerRuntimeUrl` to that path.

`vite-plugin-static-copy` in `vite.config.ts` copies:

- `./node_modules/@mlightcad/data-model/dist/dxf-parser-worker.js` → `assets/`
- `./node_modules/@mlightcad/cad-simple-viewer/dist/*-worker.js` → `assets/`
- `./node_modules/@mlightcad/cad-html-plugin/dist/viewer-runtime.iife.js` → `assets/`

If `viewer-runtime.iife.js` is missing or the URL is wrong, the dev server may return `index.html` instead and the exported HTML will fail with `Unexpected token '<'`.

## Basic integration

### Dependencies

```json
{
  "dependencies": {
    "@mlightcad/cad-simple-viewer": "^1.5.3",
    "@mlightcad/data-model": "^1.8.1",
    "@mlightcad/cad-html-plugin": "^1.5.3",
    "@mlightcad/cad-pdf-plugin": "^1.5.3",
    "@mlightcad/cad-svg-plugin": "^1.5.3"
  }
}
```

Add export plugins only if you need those features.

### HTML container

```html
<body>
  <div id="cad-container"></div>
</body>
```

### Open a file

```typescript
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { AcDbOpenDatabaseOptions } from '@mlightcad/data-model'

// ... createInstance + registerLazy*Plugin as above ...

const fileContent = await readFile(file)
const options: AcDbOpenDatabaseOptions = {
  minimumChunkSize: 1000,
  readOnly: true
}

await AcApDocManager.instance.openDocument(file.name, fileContent, options)
```

## What this example demonstrates

| Topic | Implementation |
|-------|----------------|
| Document manager | `AcApDocManager.createInstance({ container, baseUrl, webworkerFileUrls, htmlViewerRuntimeUrl })` |
| Local open | `openDocument(name, ArrayBuffer, options)` |
| Custom commands | `commandManager.addCommand(...)` — see `src/ellipseCmd.ts` |
| Plugins | `registerLazyHtmlPlugin` / `registerLazyPdfPlugin` / `registerLazySvgPlugin` |
| Export UI | `sendStringToExecute('chtml' \| 'cpdf' \| 'csvg')` |
| Workers & assets | `webworkerFileUrls`, static copy in Vite |

Lazy initialization: `AcApDocManager` is created on first file open or **New**, not at page load.

## Project structure

| Path | Role |
|------|------|
| `index.html` | Layout, file/new/export controls, canvas container |
| `src/main.ts` | `CadViewerApp` — viewer, plugins, export buttons |
| `src/ellipseCmd.ts` | Custom `ellipsedemo` command |
| `src/docCreator.ts` | Sample drawing factory for **New** |
| `vite.config.ts` | `base: './'`, copies workers + `viewer-runtime.iife.js` |

## Beyond a viewer

`cad-simple-viewer` supports modifying drawings in real time (add/edit entities). The API patterns are similar to AutoCAD RealDWG; see [`realdwg-web`](https://mlightcad.github.io/realdwg-web/) and class [`DocCreator`](./src/docCreator.ts).

### Custom commands

- [Command wiki](https://github.com/mlightcad/cad-viewer/wiki/Command)
- [Example: `ellipseCmd.ts`](./src/ellipseCmd.ts)

## Related packages

- [`@mlightcad/cad-viewer`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-viewer) — Full Vue UI with built-in lazy plugin registration
- [`cad-simple-viewer-example` (monorepo)](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-viewer-example) — Richer toolbar/sidebar demo in the main repo

## License

[MIT](LICENSE)
