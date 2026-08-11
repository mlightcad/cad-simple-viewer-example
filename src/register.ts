import { registerLazyHtmlPlugin } from '@mlightcad/cad-html-plugin/register'
import { registerLazyPdfPlugin } from '@mlightcad/cad-pdf-plugin/register'
import { registerSimpleUiPlugin } from '@mlightcad/cad-simple-ui-plugin/register'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { registerLazySvgPlugin } from '@mlightcad/cad-svg-plugin/register'

/** Served path for `viewer-runtime.iife.js` after Vite static copy (HTML export only). */
export const HTML_VIEWER_RUNTIME_URL = './assets/viewer-runtime.iife.js'

let isLazyPluginRegistered = false
let isSimpleUiRegistered = false

/**
 * Registers lazy export plugins (HTML / PDF / SVG).
 *
 * Import from each plugin's `/register` subpath so only the registration stub is in the
 * initial bundle; plugin code loads when a trigger command runs.
 *
 * `viewerRuntimeUrl` is configured on the HTML plugin — not on `AcApDocManager`.
 * Opening DXF/DWG does not require `@mlightcad/cad-html-plugin` or that file.
 */
export const registerLazyPlugins = (): void => {
  if (isLazyPluginRegistered) {
    return
  }

  const pluginManager = AcApDocManager.instance.pluginManager
  registerLazyHtmlPlugin(pluginManager, {
    viewerRuntimeUrl: HTML_VIEWER_RUNTIME_URL
  })
  registerLazyPdfPlugin(pluginManager)
  registerLazySvgPlugin(pluginManager)

  isLazyPluginRegistered = true
}

/**
 * Loads the simple UI plugin with this example's default toolbar layout.
 *
 * @param host - Viewer pane element that hosts toolbar overlays.
 */
export const registerSimpleUi = async (host: HTMLElement): Promise<void> => {
  if (isSimpleUiRegistered) {
    return
  }

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

  isSimpleUiRegistered = true
}

/**
 * Registers all plugins used by this example (export + simple UI).
 *
 * @param host - Viewer pane element passed to the simple UI plugin.
 */
export const registerPlugins = async (host: HTMLElement): Promise<void> => {
  registerLazyPlugins()
  await registerSimpleUi(host)
}
