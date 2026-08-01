import type { AcApWebworkerFiles } from '@mlightcad/cad-simple-viewer'

/**
 * DWG parser and MTEXT worker script URLs for this example.
 *
 * DXF is parsed by the built-in converter in `@mlightcad/data-model` (no separate worker).
 * Vite copies the remaining worker files from `@mlightcad/cad-simple-viewer` into
 * `dist/assets/` (see `vite.config.ts`). Host apps must deploy the same files and
 * point `webworkerFileUrls` at their served paths before calling `openDocument()`.
 */
export const WEBWORKER_FILE_URLS: Required<AcApWebworkerFiles> = {
  mtextRender: './assets/mtext-renderer-worker.js',
  dwgParser: './assets/libredwg-parser-worker.js'
}
