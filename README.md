# CAD Simple Viewer Example

A vanilla TypeScript demo that shows how to embed [`@mlightcad/cad-simple-viewer`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-viewer) in a web page: open DXF/DWG files, create a sample drawing, register custom commands, load [`@mlightcad/cad-simple-ui-plugin`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-ui-plugin) for toolbar chrome (including export), and dynamically load HTML/PDF/SVG export plugins on first use.

[**Live demo**](https://mlightcad.github.io/cad-simple-viewer-example/)

## Features

- **Local files** — Open `.dxf` / `.dwg` via the file picker
- **New drawing** — Create a sample drawing with predefined entities (`DocCreator`)
- **Simple UI toolbar** — View/review tools, layer manager, theme/locale toggles, and export submenu via `cad-simple-ui-plugin`
- **Custom command** — Demo ellipse command (`ellipsedemo`)
- **Dynamic export plugins** — HTML (`chtml`), PDF (`cpdf`), SVG (`csvg`) load in separate chunks when triggered from the toolbar export menu
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

## Web Worker readiness

DXF/DWG parsing and MTEXT rendering run in separate worker scripts. Host apps must deploy those files and set `webworkerFileUrls` in `AcApDocManager.createInstance()`. Before opening a drawing, verify the workers are reachable — do **not** probe them with a plain GET (the LibreDWG worker alone is ~12 MB).

This example centralizes URLs in [`src/workerConfig.ts`](./src/workerConfig.ts) and demonstrates the readiness APIs from [`@mlightcad/cad-simple-viewer`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-viewer) in [`src/main.ts`](./src/main.ts):

```typescript
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { WEBWORKER_FILE_URLS } from './workerConfig'

// Option 1: check before createInstance (HEAD + ranged GET fallback; caches successes)
const ready = await AcApDocManager.checkWebworkerReadiness(WEBWORKER_FILE_URLS)
if (!ready) {
  throw new Error('CAD worker scripts are missing or blocked')
}

AcApDocManager.createInstance({
  webworkerFileUrls: WEBWORKER_FILE_URLS,
  checkWorkersOnInit: true // Option 3: async probe during init
})

const manager = AcApDocManager.instance

manager.events.workersReady.addEventListener(({ ready }) => {
  if (!ready) console.error('CAD workers are not reachable')
})

// Option 2: re-check on an existing manager before openDocument()
if (!(await manager.areWorkersReady())) {
  throw new Error('CAD worker scripts are missing or blocked')
}
```

| API | When to use |
|-----|-------------|
| `AcApDocManager.checkWebworkerReadiness(urls)` | Before `createInstance()` — no manager needed |
| `manager.areWorkersReady()` | Before `openDocument()` / `openUrl()` on an existing instance |
| `checkWorkersOnInit: true` + `events.workersReady` | Fire-and-forget probe at init; react in UI when `ready` is false |
| `manager.workersReady` | Last probe result: `true`, `false`, or `null` (not checked yet) |

Successful URL probes are cached for the page lifecycle; failures are not cached at the probe layer, so transient network errors can succeed on a later call. After each check, `workersReady` is `true` or `false` (`null` only before the first check).

To test a failure locally, temporarily rename or omit a worker file under `dist/assets/` after `pnpm build`, then try **Open**.

## Usage

1. Start the dev server and open the URL shown in the terminal.
2. **Open** — Choose a `.dxf` or `.dwg` file, or click **New** to create the sample drawing. The viewer and plugins initialize on first use (not at page load).
3. After initialization, a collapsible toolbar appears on the right with view tools, layer manager, theme/locale toggles, and an **Export** submenu (HTML, PDF, SVG). Each export dynamically imports its plugin chunk on first use, so the first run may take a moment.
4. Run the custom ellipse command from the viewer command line: `ellipsedemo`.

Toast messages at the top report success or errors. The window title updates when a document is activated.

## Supported formats

| Format | Notes |
|--------|--------|
| **DXF** | Parsed in a Web Worker (`dxf-parser-worker.js`) |
| **DWG** | LibreDWG WebAssembly via `libredwg-parser-worker.js` |

## Simple UI plugin

Toolbar chrome comes from `@mlightcad/cad-simple-ui-plugin`, not custom HTML buttons. Registration lives in [`src/register.ts`](./src/register.ts):

```typescript
import { registerSimpleUiPlugin } from '@mlightcad/cad-simple-ui-plugin/register'
import { AcApDocManager, applyUiTheme } from '@mlightcad/cad-simple-viewer'

const host = document.getElementById('viewerPane')!

applyUiTheme('dark', host)

AcApDocManager.createInstance({
  container: document.getElementById('cad-container')!,
  busyIndicatorHost: host,
  // ... webworkerFileUrls, htmlViewerRuntimeUrl, etc.
})

await registerSimpleUiPlugin(AcApDocManager.instance.pluginManager, {
  host,
  toolbar: {
    placement: 'right',
    items: 'default',
    collapsible: true
  }
})
```

This example calls `registerPlugins(host)` from `src/register.ts`, which registers lazy export plugins and the simple UI plugin together. See the [cad-simple-ui-plugin README](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-ui-plugin) for toolbar customization (`items`, `appendItems`, placement, etc.).

## Plugin system (HTML / PDF / SVG export)

Export commands live in separate npm packages, not in `cad-simple-viewer`. This example **does not** statically import those packages into the main bundle. Instead, each plugin is registered with a lazy loader that uses dynamic `import()`, so Vite/Rollup emits a separate chunk per plugin and the browser fetches it only when the user runs a trigger command (from the toolbar **Export** menu or via `sendStringToExecute`).

| Package | Plugin name | Factory | Trigger commands | Purpose |
|---------|-------------|---------|------------------|---------|
| `@mlightcad/cad-html-plugin` | `HtmlPlugin` | `createHtmlPlugin()` | `chtml` | Export drawing to offline HTML |
| `@mlightcad/cad-pdf-plugin` | `PdfPlugin` | `createPdfPlugin()` | `cpdf`, `ipdf` | Export to PDF / import vector PDF |
| `@mlightcad/cad-svg-plugin` | `SvgPlugin` | `createSvgPlugin()` | `csvg` | Export drawing to SVG |

See the [Plugin System wiki](https://github.com/mlightcad/cad-viewer/wiki/Plugin-System) for how to build and register your own plugins.

### Dynamic loading (this example)

**Do not** add top-level imports such as `import { createHtmlPlugin } from '@mlightcad/cad-html-plugin'` — that would pull the plugin into the main bundle. Keep plugin packages in `dependencies` (the bundler needs them at build time to emit lazy chunks), but load them inside lazy loaders.

This repo uses each package's `/register` subpath in [`src/register.ts`](./src/register.ts) (`registerLazyHtmlPlugin`, `registerLazyPdfPlugin`, `registerLazySvgPlugin`). The stubs stay in the main bundle; plugin code loads on first trigger.

Alternatively, register manually on `pluginManager` after `AcApDocManager.createInstance()`:

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

After a document is loaded, use the toolbar **Export** submenu, or trigger export via API:

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
    "@mlightcad/cad-simple-ui-plugin": "^1.5.5",
    "@mlightcad/data-model": "^1.8.3",
    "@mlightcad/cad-html-plugin": "^1.5.5",
    "@mlightcad/cad-pdf-plugin": "^1.5.5",
    "@mlightcad/cad-svg-plugin": "^1.5.5"
  }
}
```

Add `cad-simple-ui-plugin` for toolbar chrome. Add export plugin packages only for the formats you need, and register each one with lazy loaders as shown above.

### HTML container

```html
<body>
  <div id="viewerPane">
    <div id="cad-container"></div>
  </div>
</body>
```

`viewerPane` is the host for `applyUiTheme`, `busyIndicatorHost`, and the simple UI plugin overlays; `cad-container` is the WebGL canvas parent.

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
| Document manager | `AcApDocManager.createInstance({ container, busyIndicatorHost, baseUrl, webworkerFileUrls, htmlViewerRuntimeUrl })` |
| UI theme | `applyUiTheme('dark', host)` before `createInstance` |
| Simple UI | `registerSimpleUiPlugin` via `src/register.ts` — toolbar, layers, export submenu |
| Local open | `openDocument(name, ArrayBuffer, options)` |
| Custom commands | `commandManager.addCommand(...)` — see `src/ellipseCmd.ts` |
| Lazy export plugins | `/register` stubs in `src/register.ts` — HTML, PDF, SVG chunks on first trigger |
| Export (API) | `sendStringToExecute('chtml' \| 'cpdf' \| 'csvg')` — same commands as toolbar export menu |
| Workers & assets | `webworkerFileUrls`, static copy in Vite (see [Vite configuration](#vite-configuration)) |
| Worker readiness | `checkWebworkerReadiness`, `areWorkersReady`, `checkWorkersOnInit`, `workersReady` event (see [Web Worker readiness](#web-worker-readiness)) |

Lazy initialization: `AcApDocManager` is created on first file open or **New**, not at page load.

## Project structure

| Path | Role |
|------|------|
| `index.html` | Layout, Open/New controls, `viewerPane` + canvas container |
| `src/main.ts` | `CadViewerApp` — lazy init, worker readiness checks, file open, new drawing |
| `src/workerConfig.ts` | Shared `webworkerFileUrls` paths for init and readiness probes |
| `src/register.ts` | Plugin registration — lazy export plugins + simple UI |
| `src/ellipseCmd.ts` | Custom `ellipsedemo` command |
| `src/docCreator.ts` | Sample drawing factory for **New** |
| `vite.config.ts` | Approach A: `manualChunks` for viewer stack, `modulePreload: false`, static copy of workers + `viewer-runtime.iife.js` |

## Beyond a viewer

`cad-simple-viewer` supports modifying drawings in real time (add/edit entities). The API patterns are similar to AutoCAD RealDWG; see [`realdwg-web`](https://mlightcad.github.io/realdwg-web/) and class [`DocCreator`](./src/docCreator.ts).

### Custom commands

- [Command wiki](https://github.com/mlightcad/cad-viewer/wiki/Command)
- [Example: `ellipseCmd.ts`](./src/ellipseCmd.ts)

## Related packages

- [`@mlightcad/cad-simple-ui-plugin`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-ui-plugin) — Framework-agnostic toolbar and layer manager used by this example
- [`@mlightcad/cad-viewer`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-viewer) — Full Vue UI with built-in lazy plugin registration
- [`cad-simple-viewer-example` (monorepo)](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-viewer-example) — Same simple UI plugin with a predefined-file sidebar layout

## License

[MIT](LICENSE)
