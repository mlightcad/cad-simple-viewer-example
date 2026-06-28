import type { AcApWebworkerFiles } from '@mlightcad/cad-simple-viewer'

/**
 * Parser and MTEXT worker script URLs for this example.
 *
 * Vite copies these files from `@mlightcad/cad-simple-viewer` into `dist/assets/`
 * (see `vite.config.ts`). Host apps must deploy the same files and point
 * `webworkerFileUrls` at their served paths before calling `openDocument()`.
 */
export const WEBWORKER_FILE_URLS: Required<AcApWebworkerFiles> = {
  mtextRender: './assets/mtext-renderer-worker.js',
  dxfParser: './assets/dxf-parser-worker.js',
  dwgParser: './assets/libredwg-parser-worker.js'
}
