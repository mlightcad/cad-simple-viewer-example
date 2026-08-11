/**
 * Lazy loader for `@mlightcad/cad-simple-viewer` and app modules that depend on it.
 *
 * Keeps the upload-screen entry free of a static viewer import so the homepage
 * JS stays small. Call {@link preloadViewerAppModules} after first paint to warm
 * the module cache before the user opens a file.
 */

type CadSimpleViewerModule = typeof import('@mlightcad/cad-simple-viewer')

let viewerModulePromise: Promise<CadSimpleViewerModule> | null = null
let appModulesPromise: Promise<void> | null = null

/**
 * Dynamically imports `@mlightcad/cad-simple-viewer` (and its chunked peers).
 * Subsequent calls reuse the same promise / module cache.
 */
export function loadCadSimpleViewer(): Promise<CadSimpleViewerModule> {
  if (!viewerModulePromise) {
    viewerModulePromise = import('@mlightcad/cad-simple-viewer').catch(error => {
      viewerModulePromise = null
      throw error
    })
  }
  return viewerModulePromise
}

/**
 * Preloads the viewer package plus local modules needed on first open
 * (`i18n`, ellipse demo command, and optionally plugin registration).
 *
 * Safe to call multiple times; work is shared via a single promise.
 * Failed attempts clear the cached promise so a later open can retry.
 *
 * @param enablePlugins - When `true`, also warms `./register`
 */
export function preloadViewerAppModules(enablePlugins: boolean): Promise<void> {
  if (!appModulesPromise) {
    appModulesPromise = (async () => {
      await loadCadSimpleViewer()
      const tasks: Promise<unknown>[] = [import('./i8n'), import('./ellipseCmd')]
      if (enablePlugins) {
        tasks.push(import('./register'))
      }
      await Promise.all(tasks)
    })().catch(error => {
      appModulesPromise = null
      throw error
    })
  }
  return appModulesPromise
}

/**
 * Schedules {@link preloadViewerAppModules} after the upload UI has painted,
 * using idle time so it does not compete with first paint.
 *
 * @param enablePlugins - Forwarded to {@link preloadViewerAppModules}
 */
export function scheduleViewerPreload(enablePlugins: boolean): void {
  const run = () => {
    void preloadViewerAppModules(enablePlugins)
  }

  const afterPaint = () => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => run(), { timeout: 2500 })
    } else {
      setTimeout(run, 50)
    }
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(afterPaint)
  })
}
