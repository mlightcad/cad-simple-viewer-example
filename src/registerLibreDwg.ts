/**
 * Opt into GPL LibreDWG DWG parsing for this example app.
 * `@mlightcad/cad-simple-viewer` does not register a DWG converter by default.
 */
import {
  AcDbDatabaseConverterManager,
  AcDbFileType
} from '@mlightcad/data-model'
import { AcDbLibreDwgConverter } from '@mlightcad/libredwg-converter'

/**
 * Registers {@link AcDbLibreDwgConverter} for DWG open.
 *
 * @param parserWorkerUrl - Absolute or document-relative URL of
 *   `libredwg-parser-worker.js` (wasm must sit next to that worker file)
 */
export function registerLibreDwgConverter(parserWorkerUrl: string): void {
  const converter = new AcDbLibreDwgConverter({
    convertByEntityType: false,
    useWorker: true,
    parserWorkerUrl
  })
  AcDbDatabaseConverterManager.instance.register(AcDbFileType.DWG, converter)
}
