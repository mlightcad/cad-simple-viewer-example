import type { AcApWebworkerFiles } from '@mlightcad/cad-simple-viewer'

/** Local names — do not import from `@mlightcad/cad-simple-viewer` (keeps entry lean). */
export const LIBREDWG_PARSER_WORKER_FILE = 'libredwg-parser-worker.js'
export const LIBREDWG_PARSER_WASM_FILE = 'libredwg-web.wasm'
export const MTEXT_RENDERER_WORKER_FILE = 'mtext-renderer-worker.js'

/**
 * MTEXT + LibreDWG worker URLs (same `assets/` folder as the JS bundles).
 *
 * Vite copies these next to each other under `dist/assets/` so the LibreDWG
 * worker can resolve `libredwg-web.wasm` via `import.meta.url`.
 */
export const WEBWORKER_FILE_URLS: Required<AcApWebworkerFiles> = {
  mtextRender: `./assets/${MTEXT_RENDERER_WORKER_FILE}`,
  dwgParser: `./assets/${LIBREDWG_PARSER_WORKER_FILE}`
}
