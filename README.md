# CAD Simple Viewer Example

A vanilla TypeScript demo that shows how to embed [`@mlightcad/cad-simple-viewer`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-viewer) in a web page: open DXF/DWG files, create a sample drawing, register custom commands, and dynamically load HTML/PDF/SVG export plugins via `registerLazyPlugin`.

[**Live demo**](https://mlightcad.github.io/cad-simple-viewer-example/)

## Features

- **Local files** — Open `.dxf` / `.dwg` via the file picker
- **New drawing** — Create a sample drawing with predefined entities (`DocCreator`)
- **Custom command** — Demo ellipse command (`ellipsedemo`)
- **Dynamic export plugins** — HTML (`chtml`), PDF (`cpdf`), SVG (`csvg`) load in separate chunks on first use via `import()`
- **Split viewer bundle** — Default Vite config puts `cad-simple-viewer` in its own chunk so the main entry stays small and the page loads quickly (see [Vite configuration](#vite-configuration))
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

The build copies parser workers and `viewer-runtime.iife.js` into `dist/assets/` (see [Vite configuration](#vite-configuration)).

## Usage

1. Start the dev server and open the URL shown in the terminal.
2. **Open** — Choose a `.dxf` or `.dwg` file, or click **New** to create the sample drawing.
3. After a file is opened successfully, **HTML**, **PDF**, and **SVG** export buttons appear. Each export dynamically imports its plugin chunk on first use, so the first run may take a moment.
4. Run the custom ellipse command from the viewer command line: `ellipsedemo`.

Toast messages at the top report success or errors. The window title updates when a document is activated.

## Supported formats

| Format | Notes |
|--------|--------|
| **DXF** | Parsed in a Web Worker (`dxf-parser-worker.js`) |
| **DWG** | LibreDWG WebAssembly via `libredwg-parser-worker.js` |

## Plugin system (HTML / PDF / SVG export)

Export commands live in separate npm packages, not in `cad-simple-viewer`. This example **does not** statically import those packages into the main bundle. Instead, each plugin is registered with a lazy loader that uses dynamic `import()`, so Vite/Rollup emits a separate chunk per plugin and the browser fetches it only when the user runs a trigger command.

| Package | Plugin name | Factory | Trigger commands | Purpose |
|---------|-------------|---------|------------------|---------|
| `@mlightcad/cad-html-plugin` | `HtmlPlugin` | `createHtmlPlugin()` | `chtml` | Export drawing to offline HTML |
| `@mlightcad/cad-pdf-plugin` | `PdfPlugin` | `createPdfPlugin()` | `cpdf`, `ipdf` | Export to PDF / import vector PDF |
| `@mlightcad/cad-svg-plugin` | `SvgPlugin` | `createSvgPlugin()` | `csvg` | Export drawing to SVG |

See the [Plugin System wiki](https://github.com/mlightcad/cad-viewer/wiki/Plugin-System) for how to build and register your own plugins.

### Dynamic loading (this example)

**Do not** add top-level imports such as `import { createHtmlPlugin } from '@mlightcad/cad-html-plugin'` — that would pull the plugin into the main bundle. Keep plugin packages in `dependencies` (the bundler needs them at build time to emit lazy chunks), but load them inside `registerLazyPlugin` loaders.

After `AcApDocManager.createInstance()`, register each plugin on `pluginManager`:

```typescript
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

const pluginManager = AcApDocManager.instance.pluginManager

pluginManager.registerLazyPlugin({
  name: 'HtmlPlugin',
  triggers: ['chtml'],
  loader: async () => {
    const { createHtmlPlugin } = await import('@mlightcad/cad-html-plugin')
    return createHtmlPlugin()
  }
})

pluginManager.registerLazyPlugin({
  name: 'PdfPlugin',
  triggers: ['cpdf', 'ipdf'],
  loader: async () => {
    const { createPdfPlugin } = await import('@mlightcad/cad-pdf-plugin')
    return createPdfPlugin()
  }
})

pluginManager.registerLazyPlugin({
  name: 'SvgPlugin',
  triggers: ['csvg'],
  loader: async () => {
    const { createSvgPlugin } = await import('@mlightcad/cad-svg-plugin')
    return createSvgPlugin()
  }
})
```

How it works:

1. **Registration** — `registerLazyPlugin` records the plugin name, trigger command(s), and an async `loader` only. No plugin code runs yet.
2. **First trigger** — When the user runs `chtml`, `cpdf`, `ipdf`, or `csvg` (via UI or `sendStringToExecute`), the plugin manager calls the matching `loader`.
3. **Dynamic import** — The loader’s `import('@mlightcad/cad-*-plugin')` fetches the plugin chunk, invokes the factory (`createHtmlPlugin`, etc.), and registers the returned plugin instance.
4. **Subsequent use** — The plugin stays loaded; later exports do not re-download the chunk.

To verify code-splitting, run `pnpm analyze` and open `stats.html` — the viewer stack and each plugin should appear as separate chunks (or the viewer inside `main`, depending on your Vite setup; see below).

## Vite configuration

Vite controls how `@mlightcad/cad-simple-viewer`, its parser workers, and export plugins land in `dist/`. This repo ships **two supported setups**. Both keep export plugins out of the main bundle via dynamic `import()` in `registerLazyPlugin` loaders; they differ in whether the viewer itself is split into its own chunk.

Shared settings (both approaches):

- **`base: './'`** — relative asset URLs for static hosting (e.g. GitHub Pages).
- **`build.modulePreload: false`** — do not inject `<link rel="modulepreload">` for lazy chunks; plugin bundles load only when a trigger command runs.
- **`vite-plugin-static-copy`** — copy parser workers and `viewer-runtime.iife.js` into `dist/assets/` (required at runtime; not part of the JS bundle graph).
- **`pnpm analyze`** — `vite build --mode analyze` writes `stats.html` for bundle inspection.

### Approach A — Viewer in a separate chunk (default in this repo)

Use `rollupOptions.output.manualChunks` to emit `@mlightcad/cad-simple-viewer` and its core dependencies (`data-model`, `three-renderer`, `geometry-engine`) as a single output file (e.g. `cad-simple-viewer-[hash].js`). Your app shell stays in `main-[hash].js`, which stays small so the initial HTML/JS parse is fast. Export plugins remain separate async chunks.

**When to use:** production demos or apps where you want the smallest main entry and a dedicated, cacheable viewer chunk.

```typescript
import { resolve } from 'path'
import { defineConfig } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const VIEWER_STACK =
  /\/(cad-simple-viewer|three-renderer|data-model|geometry-engine)\//

export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    modulePreload: false,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html') },
      output: {
        manualChunks(id) {
          const path = id.replace(/\\/g, '/')
          if (VIEWER_STACK.test(path)) return 'cad-simple-viewer'
        }
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: './node_modules/@mlightcad/cad-simple-viewer/dist/*-worker.js',
          dest: 'assets'
        },
        {
          src: './node_modules/@mlightcad/cad-html-plugin/dist/viewer-runtime.iife.js',
          dest: 'assets'
        }
      ]
    }),
    mode === 'analyze' &&
      visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true })
  ].filter(Boolean)
}))
```

This matches the current [`vite.config.ts`](./vite.config.ts).

### Approach B — Viewer in the main bundle (simpler)

Omit `manualChunks`. Rollup bundles `cad-simple-viewer` into the main entry. Export plugins are still lazy-loaded with dynamic `import()` and never ship in that initial payload.

**When to use:** smaller projects or prototypes where a simpler config matters more than minimizing main-bundle size.

```typescript
import { resolve } from 'path'
import { defineConfig } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    modulePreload: false,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html') }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: './node_modules/@mlightcad/cad-simple-viewer/dist/*-worker.js',
          dest: 'assets'
        },
        {
          src: './node_modules/@mlightcad/cad-html-plugin/dist/viewer-runtime.iife.js',
          dest: 'assets'
        }
      ]
    }),
    mode === 'analyze' &&
      visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true })
  ].filter(Boolean)
}))
```

### Comparison

| | Approach A (separate viewer chunk) | Approach B (viewer in main) |
|---|----------------------------------|-----------------------------|
| Main bundle size | Smallest | Includes full viewer stack |
| Vite config | `manualChunks` for viewer deps | No extra Rollup output options |
| Export plugins | Lazy chunks via `import()` | Lazy chunks via `import()` |
| Workers / HTML runtime | Static copy to `assets/` | Static copy to `assets/` |

Plugin packages stay normal `dependencies` in `package.json` in both cases — the bundler needs them at build time to emit lazy chunks; they are not inlined into the main entry unless you add top-level static imports.

### Run export commands

After a document is loaded, trigger export via UI or API:

```typescript
AcApDocManager.instance.sendStringToExecute('chtml')
AcApDocManager.instance.sendStringToExecute('cpdf')
AcApDocManager.instance.sendStringToExecute('csvg')
```

`sendStringToExecute` runs the matching lazy loader on first use. You do not need to call `loadByTrigger` unless you want to preload a plugin before the user clicks export.

### Static assets for HTML export

HTML export embeds `viewer-runtime.iife.js` from `@mlightcad/cad-html-plugin` (not from `cad-simple-viewer`). Copy it next to your workers and set `htmlViewerRuntimeUrl` to that path.

`vite-plugin-static-copy` (see [Vite configuration](#vite-configuration)) copies:

- `./node_modules/@mlightcad/cad-simple-viewer/dist/*-worker.js` → `assets/` (DXF/DWG parsers, mtext renderer, etc.)
- `./node_modules/@mlightcad/cad-html-plugin/dist/viewer-runtime.iife.js` → `assets/`

If `viewer-runtime.iife.js` is missing or the URL is wrong, the dev server may return `index.html` instead and the exported HTML will fail with `Unexpected token '<'`.

## Basic integration

### Dependencies

```json
{
  "dependencies": {
    "@mlightcad/cad-simple-viewer": "^1.5.5",
    "@mlightcad/data-model": "^1.8.3",
    "@mlightcad/cad-html-plugin": "^1.5.5",
    "@mlightcad/cad-pdf-plugin": "^1.5.5",
    "@mlightcad/cad-svg-plugin": "^1.5.5"
  }
}
```

Add export plugin packages only for the formats you need, and register each one with `registerLazyPlugin` + dynamic `import()` as shown above.

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

// ... createInstance + registerLazyPlugin loaders as above ...

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
| Lazy plugins | `pluginManager.registerLazyPlugin({ name, triggers, loader })` with dynamic `import()` |
| Export UI | `sendStringToExecute('chtml' \| 'cpdf' \| 'csvg')` |
| Workers & assets | `webworkerFileUrls`, static copy in Vite (see [Vite configuration](#vite-configuration)) |

Lazy initialization: `AcApDocManager` is created on first file open or **New**, not at page load.

## Project structure

| Path | Role |
|------|------|
| `index.html` | Layout, file/new/export controls, canvas container |
| `src/main.ts` | `CadViewerApp` — viewer, plugins, export buttons |
| `src/ellipseCmd.ts` | Custom `ellipsedemo` command |
| `src/docCreator.ts` | Sample drawing factory for **New** |
| `vite.config.ts` | Approach A: `manualChunks` for viewer stack, `modulePreload: false`, static copy of workers + `viewer-runtime.iife.js` |

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
