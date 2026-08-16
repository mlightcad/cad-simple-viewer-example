# CAD Simple Viewer Example

A vanilla TypeScript **multi-page** demo that shows how to embed [`@mlightcad/cad-simple-viewer`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-viewer) in a web page: open DXF/DWG files, register custom commands, optionally load [`@mlightcad/cad-simple-ui-plugin`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-ui-plugin) for toolbar chrome (including export), and dynamically load HTML/PDF/SVG export plugins on first use. A second page runs the same viewer **without any plugins** so you can compare configurations.

[**Live demo**](https://mlightcad.github.io/cad-simple-viewer-example/) · [**Without plugins**](https://mlightcad.github.io/cad-simple-viewer-example/no-plugin.html)

## Features

- **Multi-page demos** — [`index.html`](./index.html) (with plugins) and [`no-plugin.html`](./no-plugin.html) (bare viewer); switch from the upload-screen nav
- **Local files** — Open `.dxf` / `.dwg` via the file picker
- **Sample drawing factory** — `DocCreator` helper for creating drawings with predefined entities
- **Simple UI toolbar** — View/review tools, theme/locale toggles, and export submenu via `cad-simple-ui-plugin` (with-plugins page only)
- **Layer Manager dock** — Toolbar **Layer Manager** opens a Chrome DevTools-style dock panel (layers tab) beside the canvas; the host page must provide a dedicated canvas parent (see [Dock panel host layout](#dock-panel-host-layout))
- **Custom command** — Demo ellipse command (`ellipsedemo`)
- **Dynamic export plugins** — HTML (`chtml`), PDF (`cpdf`), SVG (`csvg`) load in separate chunks when triggered from the toolbar export menu (with-plugins page only)
- **Optional plugins** — Skip all plugin registration for a canvas-only host (see [Running without plugins](#running-without-plugins))
- **Split viewer bundles** — Default Vite config emits separate chunks for `cad-simple-viewer`, `data-model`, `three-renderer` (with MTEXT stack), and `three`, so the viewer file stays smaller and peers cache independently (see [Vite configuration](#vite-configuration))
- **Browser-only** — Parsing and rendering run in the browser (Web Workers + WebAssembly for DWG)

## Prerequisites

- Node.js **≥ 22** and pnpm **≥ 10** (`vite-plugin-static-copy` v4)

## Getting started

```bash
pnpm install
pnpm dev      # Vite dev server (default http://localhost:5173)
pnpm build    # Typecheck + production build
pnpm preview  # Serve dist/
```

The build copies the MTEXT worker from `@mlightcad/cad-simple-viewer` and the LibreDWG worker (+ wasm) from `@mlightcad/libredwg-converter` into `dist/assets/` (wasm must sit next to the LibreDWG worker for `import.meta.url`). If `@mlightcad/cad-html-plugin` is installed, it also copies `viewer-runtime.iife.js` (HTML export only — see [HTML plugin and viewer-runtime](#html-plugin-and-viewer-runtimeiifejs-are-optional)).

## Web Worker readiness

MTEXT rendering runs in a worker shipped with `@mlightcad/cad-simple-viewer`. DXF is parsed by the built-in converter in `@mlightcad/data-model` (no separate worker). **DWG support is opt-in** because LibreDWG is GPL: this example depends on `@mlightcad/libredwg-converter`, deploys its worker (+ wasm), and registers the converter via [`src/registerLibreDwg.ts`](./src/registerLibreDwg.ts) before `createInstance`. Host apps that skip DWG can omit that package and `webworkerFileUrls.dwgParser`.

Before opening a drawing, verify the workers are reachable — do **not** probe them with a plain full GET (the LibreDWG **wasm** next to the worker is ~10 MB).

This example centralizes URLs in [`src/workerConfig.ts`](./src/workerConfig.ts) and demonstrates the readiness APIs from [`@mlightcad/cad-simple-viewer`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-viewer) in [`src/app.ts`](./src/app.ts):

```typescript
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { registerLibreDwgConverter } from './registerLibreDwg'
import { WEBWORKER_FILE_URLS } from './workerConfig'

// Deploy worker + wasm side-by-side under ./assets/ (see vite.config.ts)
registerLibreDwgConverter(WEBWORKER_FILE_URLS.dwgParser)

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

1. Start the dev server and open the URL shown in the terminal (`index.html` by default).
2. Use the top nav (**With plugins** / **Without plugins**) to switch demos, or open `/no-plugin.html` directly.
3. **Open** — Choose a `.dxf` or `.dwg` file. The viewer (and plugins, on the first page) initialize on first use (not at page load).
4. On the **With plugins** page, a collapsible toolbar appears on the right with view tools, **Layer Manager**, theme/locale toggles, and an **Export** submenu (HTML, PDF, SVG). Click **Layer Manager** to open the dock panel on the left (layers list). Each export dynamically imports its plugin chunk on first use, so the first run may take a moment.
5. On the **Without plugins** page there is no toolbar — only the canvas and this example’s upload / reopen UI.
6. Run the custom ellipse command from the viewer command line (when available): `ellipsedemo`.

Toast messages at the top report success or errors. The window title updates when a document is activated.

## Running without plugins

Plugins are **opt-in**. `cad-simple-viewer` does not load UI or export plugins unless your host registers them. This repo shows both setups:

| Page | Entry | Plugins |
|------|--------|---------|
| [`index.html`](./index.html) | [`src/main.ts`](./src/main.ts) | Simple UI + lazy HTML/PDF/SVG via `registerPlugins()` |
| [`no-plugin.html`](./no-plugin.html) | [`src/mainNoPlugin.ts`](./src/mainNoPlugin.ts) | None — bare `AcApDocManager` only |

Shared app logic lives in [`src/app.ts`](./src/app.ts). Pass `enablePlugins: false` to skip registration:

```typescript
import { bootCadViewerApp } from './app'

// Bare viewer — no toolbar, no export plugins
bootCadViewerApp({ enablePlugins: false })
```

Equivalent manual setup after `AcApDocManager.createInstance()`:

```typescript
import { AcApDocManager, acedApplyUiTheme } from '@mlightcad/cad-simple-viewer'
import { WEBWORKER_FILE_URLS } from './workerConfig'

acedApplyUiTheme('dark', host)

AcApDocManager.createInstance({
  container: document.getElementById('cad-container')!,
  busyIndicatorHost: host,
  autoResize: true,
  webworkerFileUrls: WEBWORKER_FILE_URLS
})

// Do NOT call:
// - registerPlugins(host)
// - registerSimpleUiPlugin(...)
// - registerLazyHtmlPlugin / registerLazyPdfPlugin / registerLazySvgPlugin
// - pluginManager.registerLazyPlugin(...)

// Open drawings with your own UI, e.g.:
// await AcApDocManager.instance.openDocument(name, arrayBuffer, options)
```

Checklist when you want a canvas-only host:

1. **Do not** import `@mlightcad/cad-*-plugin` packages (or their `/register` stubs) into the entry that should stay plugin-free. Prefer a dynamic `import('./register')` only when plugins are enabled (as in `src/app.ts`) so the bare page never fetches those stubs.
2. **Do not** call `registerPlugins`, `registerSimpleUiPlugin`, or `registerLazy*Plugin`.
3. Provide your own open / chrome UI (this example keeps the upload screen and corner **Open** button).
4. You can still register **custom commands** on `commandManager` without any plugin packages.

To add plugins later, call the helpers in [`src/register.ts`](./src/register.ts) (or register lazily yourself — see [Plugin system](#plugin-system-html--pdf--svg-export)).

### HTML plugin and `viewer-runtime.iife.js` are optional

[`viewer-runtime.iife.js`](https://github.com/mlightcad/cad-viewer/issues/472) ships with `@mlightcad/cad-html-plugin`. It is **not** part of core viewing. Configure it on the HTML plugin only:

```typescript
import { registerLazyHtmlPlugin } from '@mlightcad/cad-html-plugin/register'

registerLazyHtmlPlugin(AcApDocManager.instance.pluginManager, {
  viewerRuntimeUrl: './assets/viewer-runtime.iife.js'
})
```

Do **not** pass a runtime URL to `AcApDocManager.createInstance()` — that option was removed from `cad-simple-viewer`. The plugin fetches the runtime only when you run HTML export (`chtml`).

| Need | `@mlightcad/cad-html-plugin` | Copy `viewer-runtime.iife.js` / `viewerRuntimeUrl` |
|------|------------------------------|-----------------------------------------------------|
| Open / view DXF or DWG | Not required | Not required |
| Toolbar / PDF / SVG export | Not required (those are separate packages) | Not required |
| Export offline HTML (`chtml`) | Required | Required |

This example copies `viewer-runtime.iife.js` in Vite **only if** the HTML plugin package is present. The **Without plugins** page never registers HTML export.

#### Remove the HTML plugin package entirely

```bash
pnpm remove @mlightcad/cad-html-plugin
pnpm build
pnpm dev
```

Then open either demo page and load a DXF/DWG — viewing still works. On the **With plugins** page you would also remove the `registerLazyHtmlPlugin` call from [`src/register.ts`](./src/register.ts); PDF/SVG and the simple UI can remain.

## Supported formats

| Format | Notes |
|--------|--------|
| **DXF** | Built-in converter in `@mlightcad/data-model` (no separate worker) |
| **DWG** | Optional `@mlightcad/libredwg-converter` (GPL) — registered by this example |

## Simple UI plugin

Toolbar chrome comes from `@mlightcad/cad-simple-ui-plugin`, not custom HTML buttons. Registration lives in [`src/register.ts`](./src/register.ts):

```typescript
import { registerSimpleUiPlugin } from '@mlightcad/cad-simple-ui-plugin/register'
import { AcApDocManager, acedApplyUiTheme } from '@mlightcad/cad-simple-viewer'

const host = document.getElementById('viewerPane')!

acedApplyUiTheme('dark', host)

AcApDocManager.createInstance({
  container: document.getElementById('cad-container')!,
  busyIndicatorHost: host,
  // ... webworkerFileUrls, etc.
})

await registerSimpleUiPlugin(AcApDocManager.instance.pluginManager, {
  host,
  dockPanel: {
    defaultOpen: false,
    defaultSide: 'left',
    defaultHeight: 240,
    defaultWidth: 280
  },
  toolbar: {
    placement: 'right',
    items: 'default',
    collapsible: true
  }
})
```

This example’s **With plugins** page calls `registerPlugins(host)` from `src/register.ts`, which registers lazy export plugins and the simple UI plugin together. The **Without plugins** page never calls that function — see [Running without plugins](#running-without-plugins). See the [cad-simple-ui-plugin README](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-ui-plugin) for toolbar customization (`items`, `appendItems`, placement, etc.).

### Dock panel host layout

Starting with `cad-simple-ui-plugin` **1.5.8**, the toolbar **Layer Manager** button runs the `layer` command and opens a **dock panel** tab (not a floating popover as in 1.5.7). The dock mounts on the **viewer canvas parent inside `host`**, then uses flex layout so the canvas shrinks when the panel is open.

Give the page a dedicated canvas area under `viewerPane`. Do **not** put full-screen overlays (upload UI, FABs) as direct siblings of `#cad-container` under `host` without a wrapper — otherwise the dock wraps those nodes into its main flex slot and the panel may fail to appear correctly.

```html
<div id="viewerPane" class="viewer-container">
  <!-- Optional overlays stay on the host; they are outside the dock mount target -->
  <div class="upload-screen">...</div>
  <button type="button" class="reopen-fab">Open</button>

  <!-- Dock mount target = parent of #cad-container -->
  <section class="viewer-canvas-area">
    <div id="cad-container"></div>
  </section>
</div>
```

Suggested CSS (matches [`index.html`](./index.html)):

```css
.viewer-container {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.viewer-canvas-area {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

#cad-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
```

Behavior after a drawing is open:

| Action | Result |
|--------|--------|
| Toolbar **Layer Manager** / `sendStringToExecute('layer')` | Opens the dock (or focuses the **Layers** tab) |
| Dock close button / `layerclose` | Closes the dock panel |
| Collapse the toolbar | Closes the dock panel |

Override the mount element with `dockPanel.mountTarget` when you need a custom layout.

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
import { registerLazyHtmlPlugin } from '@mlightcad/cad-html-plugin/register'

AcApDocManager.createInstance({
  container: document.getElementById('cad-container')!,
  autoResize: true,
  webworkerFileUrls: {
    mtextRender: './assets/mtext-renderer-worker.js',
    dwgParser: './assets/libredwg-parser-worker.js'
  }
})

const pluginManager = AcApDocManager.instance.pluginManager

// HTML export only — configure runtime URL on the plugin, not createInstance
registerLazyHtmlPlugin(pluginManager, {
  viewerRuntimeUrl: './assets/viewer-runtime.iife.js'
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

Vite controls how `@mlightcad/cad-simple-viewer`, its DWG/MTEXT workers, and export plugins land in `dist/`. This repo ships **two supported setups**. Both keep export plugins out of the main bundle via dynamic `import()` in `registerLazyPlugin` loaders; they differ in whether the viewer itself is split into its own chunk.

Shared settings (both approaches):

- **`base: './'`** — relative asset URLs for static hosting (e.g. GitHub Pages).
- **`build.modulePreload: false`** — do not inject `<link rel="modulepreload">` for lazy chunks; plugin bundles load only when a trigger command runs.
- **`vite-plugin-static-copy`** — copy the MTEXT worker from `cad-simple-viewer` and the LibreDWG worker (+ wasm) from `@mlightcad/libredwg-converter` into `dist/assets/` (required for MTEXT / DWG; wasm must be next to the LibreDWG worker). Use `rename: { stripBase: true }` with `vite-plugin-static-copy` ≥ 4. Copy `viewer-runtime.iife.js` **only if** `@mlightcad/cad-html-plugin` is installed (optional; HTML export only).
- **`pnpm analyze`** — `vite build --mode analyze` writes `stats.html` for bundle inspection.

### Approach A — Viewer stack in separate chunks (default in this repo)

Use `rollupOptions.output.manualChunks` to emit the viewer and its heavy peer dependencies as **separate** cacheable files:

| Chunk | Packages |
|-------|----------|
| `three` | `three` (+ `three/examples/jsm/*`) |
| `data-model` | `@mlightcad/data-model`, `geometry-engine`, `graphic-interface`, `common` |
| `three-renderer` | `@mlightcad/three-renderer`, `mtext-renderer`, `mtext-parser`, `shx-parser` |
| `cad-simple-viewer` | `@mlightcad/cad-simple-viewer` only |

Your app shell stays in a tiny `main`/`app` entry. Export plugins remain separate async chunks. Keep MTEXT packages with `three-renderer` — otherwise Rollup may place them inside `cad-simple-viewer` and create a circular chunk edge (`three-renderer` ↔ `cad-simple-viewer`), which historically caused runtime `extends undefined`.

**When to use:** production demos or apps where you want a small main entry, a smaller viewer file, and independently cacheable peer deps.

```typescript
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { viteStaticCopy } from 'vite-plugin-static-copy'

function viewerManualChunk(id: string): string | undefined {
  const path = id.replace(/\\/g, '/')
  if (
    path.includes('vite/preload-helper') ||
    path.includes('vite/modulepreload-polyfill')
  ) {
    return 'vite-preload'
  }
  if (
    path.includes('/node_modules/three/') ||
    path.includes('/node_modules/.pnpm/three@')
  ) {
    return 'three'
  }
  if (
    path.includes('/@mlightcad/three-renderer/') ||
    path.includes('/@mlightcad/mtext-renderer/') ||
    path.includes('/@mlightcad/mtext-parser/') ||
    path.includes('/@mlightcad/shx-parser/')
  ) {
    return 'three-renderer'
  }
  if (
    path.includes('/@mlightcad/data-model/') ||
    path.includes('/@mlightcad/geometry-engine/') ||
    path.includes('/@mlightcad/graphic-interface/') ||
    path.includes('/@mlightcad/common/')
  ) {
    return 'data-model'
  }
  if (path.includes('/@mlightcad/cad-simple-viewer/')) {
    return 'cad-simple-viewer'
  }
}

const viewerRuntimeSrc =
  './node_modules/@mlightcad/cad-html-plugin/dist/viewer-runtime.iife.js'

export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    modulePreload: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'no-plugin': resolve(__dirname, 'no-plugin.html')
      },
      output: {
        manualChunks: viewerManualChunk
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: './node_modules/@mlightcad/cad-simple-viewer/dist/mtext-renderer-worker.js',
          dest: 'assets',
          rename: { stripBase: true }
        },
        {
          src: './node_modules/@mlightcad/libredwg-converter/dist/libredwg-parser-worker.js',
          dest: 'assets',
          rename: { stripBase: true }
        },
        {
          src: './node_modules/@mlightcad/libredwg-converter/dist/libredwg-web.wasm',
          dest: 'assets',
          rename: { stripBase: true }
        },
        // Optional — omit entirely if you do not use HTML export
        ...(existsSync(resolve(__dirname, viewerRuntimeSrc))
          ? [
              {
                src: viewerRuntimeSrc,
                dest: 'assets',
                rename: { stripBase: true }
              }
            ]
          : [])
      ]
    }),
    mode === 'analyze' &&
      visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true })
  ].filter(Boolean)
}))
```

The current [`vite.config.ts`](./vite.config.ts) copies workers and wasm into `dist/assets/` (with `rename: { stripBase: true }` for `vite-plugin-static-copy` ≥ 4), and copies `viewer-runtime.iife.js` only when the HTML plugin package is present. Multi-page `input` emits both `index.html` and `no-plugin.html` into `dist/`.

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
      input: {
        main: resolve(__dirname, 'index.html'),
        'no-plugin': resolve(__dirname, 'no-plugin.html')
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: './node_modules/@mlightcad/cad-simple-viewer/dist/mtext-renderer-worker.js',
          dest: 'assets',
          rename: { stripBase: true }
        },
        {
          src: './node_modules/@mlightcad/libredwg-converter/dist/libredwg-parser-worker.js',
          dest: 'assets',
          rename: { stripBase: true }
        },
        {
          src: './node_modules/@mlightcad/libredwg-converter/dist/libredwg-web.wasm',
          dest: 'assets',
          rename: { stripBase: true }
        },
        {
          src: './node_modules/@mlightcad/cad-html-plugin/dist/viewer-runtime.iife.js',
          dest: 'assets',
          rename: { stripBase: true }
        }
      ]
    }),
    mode === 'analyze' &&
      visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true })
  ].filter(Boolean)
}))
```

### Comparison

| | Approach A (split viewer stack) | Approach B (viewer in main) |
|---|----------------------------------|-----------------------------|
| Main bundle size | Smallest | Includes full viewer stack |
| Viewer deps | Separate `three` / `data-model` / `three-renderer` / `cad-simple-viewer` chunks | Bundled into main |
| Vite config | `manualChunks` as above | No extra Rollup output options |
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

HTML export embeds `viewer-runtime.iife.js` from `@mlightcad/cad-html-plugin` (not from `cad-simple-viewer`). This file is **only** fetched when running `chtml`, not when opening drawings. If you do not use HTML export, you can omit the package, the Vite copy target, and `viewerRuntimeUrl` — see [HTML plugin and viewer-runtime](#html-plugin-and-viewer-runtimeiifejs-are-optional).

When the package is installed, `vite-plugin-static-copy` (see [Vite configuration](#vite-configuration)) copies:

- `./node_modules/@mlightcad/cad-simple-viewer/dist/mtext-renderer-worker.js` → `assets/` — always
- `./node_modules/@mlightcad/libredwg-converter/dist/libredwg-parser-worker.js` (+ `libredwg-web.wasm`) → `assets/` — when opting into DWG (wasm must be beside the worker)
- `./node_modules/@mlightcad/cad-html-plugin/dist/viewer-runtime.iife.js` → `assets/` — only if the package is present

If you use HTML export and `viewer-runtime.iife.js` is missing or the URL is wrong, export fails when loading the runtime (or the dev server may return `index.html` and you see `Unexpected token '<'`).

## Basic integration

### Dependencies

```json
{
  "dependencies": {
    "@mlightcad/cad-simple-viewer": "1.6.0",
    "@mlightcad/cad-simple-ui-plugin": "1.6.0",
    "@mlightcad/data-model": "1.13.0",
    "@mlightcad/libredwg-converter": "^3.13.0",
    "@mlightcad/cad-html-plugin": "1.6.0",
    "@mlightcad/cad-pdf-plugin": "1.6.0",
    "@mlightcad/cad-svg-plugin": "1.6.0"
  }
}
```

Add `cad-simple-ui-plugin` for toolbar chrome. Add `@mlightcad/libredwg-converter` only if you need DWG (GPL). Add export plugin packages only for the formats you need, and register each one with lazy loaders as shown above. **`@mlightcad/cad-html-plugin` is optional** — required only for offline HTML export (`chtml`), not for viewing drawings (see [HTML plugin and viewer-runtime](#html-plugin-and-viewer-runtimeiifejs-are-optional)).

### HTML container

```html
<body>
  <div id="viewerPane" class="viewer-container">
    <section class="viewer-canvas-area">
      <div id="cad-container"></div>
    </section>
  </div>
</body>
```

- `viewerPane` — host for `acedApplyUiTheme`, `busyIndicatorHost`, and the simple UI plugin (`host` option)
- `.viewer-canvas-area` — parent of the canvas; preferred dock mount target (see [Dock panel host layout](#dock-panel-host-layout))
- `cad-container` — WebGL / view canvas parent passed to `AcApDocManager.createInstance({ container })`

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
| Multi-page demos | `index.html` (plugins on) + `no-plugin.html` (plugins off) |
| Document manager | `AcApDocManager.createInstance({ container, busyIndicatorHost, baseUrl, webworkerFileUrls })` |
| UI theme | `acedApplyUiTheme('dark', host)` before `createInstance` |
| Simple UI | `registerSimpleUiPlugin` via `src/register.ts` — toolbar, dock panel / Layer Manager, export submenu |
| Skip plugins | `bootCadViewerApp({ enablePlugins: false })` — see [Running without plugins](#running-without-plugins) |
| HTML runtime URL | `registerLazyHtmlPlugin(pm, { viewerRuntimeUrl })` — not on `createInstance` |
| Dock host layout | `#viewerPane` + `.viewer-canvas-area` + `#cad-container` in each HTML page |
| Local open | `openDocument(name, ArrayBuffer, options)` |
| Custom commands | `commandManager.addCommand(...)` — see `src/ellipseCmd.ts` |
| Lazy export plugins | `/register` stubs in `src/register.ts` — HTML, PDF, SVG chunks on first trigger |
| Export (API) | `sendStringToExecute('chtml' \| 'cpdf' \| 'csvg')` — same commands as toolbar export menu |
| Workers & assets | `webworkerFileUrls`, static copy in Vite; LibreDWG via `registerLibreDwg.ts` (see [Vite configuration](#vite-configuration)) |
| Worker readiness | `checkWebworkerReadiness`, `areWorkersReady`, `checkWorkersOnInit`, `workersReady` event (see [Web Worker readiness](#web-worker-readiness)) |

Lazy initialization: `AcApDocManager` is created on first file open, not at page load.

## Project structure

| Path | Role |
|------|------|
| `index.html` | With-plugins demo — upload UI, `viewerPane` host, dock mount, `#cad-container` |
| `no-plugin.html` | Bare-viewer demo — same open UI, no plugin registration |
| `.cursor/mcp.json` | Project MCP servers for RealDWG / cad-viewer / MTEXT docs (see [Ask the docs via MCP](#ask-the-docs-via-mcp)) |
| `src/styles/app.css` | Shared layout / upload-screen styles for both pages |
| `src/app.ts` | `CadViewerApp` + `bootCadViewerApp` — lazy init, worker checks, optional plugins |
| `src/main.ts` | Entry for with-plugins page (`enablePlugins: true`) |
| `src/mainNoPlugin.ts` | Entry for bare viewer page (`enablePlugins: false`) |
| `src/workerConfig.ts` | Shared `webworkerFileUrls` paths under `./assets/` |
| `src/registerLibreDwg.ts` | Host opt-in: registers GPL `@mlightcad/libredwg-converter` for DWG |
| `src/register.ts` | Plugin registration — lazy export plugins + simple UI (`viewerRuntimeUrl` on HTML plugin) |
| `src/ellipseCmd.ts` | Custom `ellipsedemo` command |
| `src/docCreator.ts` | Sample drawing factory helper |
| `vite.config.ts` | Multi-page inputs, Approach A `manualChunks`, copy workers/wasm (+ optional `viewer-runtime.iife.js`) to `dist/assets/` |

## Beyond a viewer

`cad-simple-viewer` supports modifying drawings in real time (add/edit entities). The API patterns are similar to AutoCAD RealDWG; see [`realdwg-web`](https://mlightcad.github.io/realdwg-web/) and class [`DocCreator`](./src/docCreator.ts).

### Custom commands

- [Command wiki](https://github.com/mlightcad/cad-viewer/wiki/Command)
- [Example: `ellipseCmd.ts`](./src/ellipseCmd.ts)

## Ask the docs via MCP

If anything about the drawing / entity APIs or MTEXT rendering is unclear while you work in an AI coding tool, ask through these [GitMCP](https://gitmcp.io) doc servers instead of guessing from outdated training data:

| MCP server | Docs source | Use when |
|------------|-------------|---------|
| `realdwg-web Docs` | [mlightcad/realdwg-web](https://gitmcp.io/mlightcad/realdwg-web) | Database / entity APIs (RealDWG-style patterns used by this stack) |
| `cad-viewer Docs` | [mlightcad/cad-viewer](https://gitmcp.io/mlightcad/cad-viewer) | Viewer packages (`cad-simple-viewer`, plugins, commands, workers) |
| `mtext-renderer Docs` | [mlightcad/mtext-renderer](https://gitmcp.io/mlightcad/mtext-renderer) | MTEXT parsing, layout, and rendering |

**Cursor:** this repo already ships the servers in [`.cursor/mcp.json`](./.cursor/mcp.json). Open the project, enable the servers if prompted, then ask in chat (for example: how to create a polyline, or how MTEXT workers relate to `webworkerFileUrls`).

**Other vibe coding tools** (Claude Desktop, Windsurf, VS Code, Cline, etc.): open each GitMCP URL above in a browser. The page shows ready-made MCP config snippets for many clients — copy the settings for your tool into its MCP / settings file. No local install is required; GitMCP runs as a remote docs server.

## Related packages

- [`@mlightcad/cad-simple-ui-plugin`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-ui-plugin) — Framework-agnostic toolbar and Layer Manager dock panel used by this example
- [`@mlightcad/cad-viewer`](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-viewer) — Full Vue UI with built-in lazy plugin registration
- [`cad-simple-viewer-example` (monorepo)](https://github.com/mlightcad/cad-viewer/tree/main/packages/cad-simple-viewer-example) — Same simple UI plugin with a predefined-file sidebar layout

## License

[MIT](LICENSE)
