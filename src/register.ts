import { registerLazyHtmlPlugin } from '@mlightcad/cad-html-plugin/register'
import { registerLazyPdfPlugin } from '@mlightcad/cad-pdf-plugin/register'
import {
  acuiCreateDefaultToolbarPresetMap,
  acuiCreateToolbarSeparator,
  acuiRegisterSimpleUiPlugin,
  acuiToolbarPreset,
  type AcUiDefaultToolbarContext,
  type AcUiToolbarItem,
  type AcUiToolbarItemConfig
} from '@mlightcad/cad-simple-ui-plugin'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { registerLazySvgPlugin } from '@mlightcad/cad-svg-plugin/register'

/** Served path for `viewer-runtime.iife.js` after Vite static copy (HTML export only). */
export const HTML_VIEWER_RUNTIME_URL = './assets/viewer-runtime.iife.js'

/**
 * Blank script lines accept each `chtml` keyword default (format, invisible
 * layers, layouts, initial view, viewer mode) so the toolbar downloads a file
 * instead of waiting on the command line.
 */
const EXPORT_HTML_COMMAND = ['chtml', '', '', '', '', ''].join('\n')

/**
 * Blank script lines accept each `cpdf` keyword default (model-space fit,
 * layouts, text mode).
 */
const EXPORT_PDF_COMMAND = ['cpdf', '', '', ''].join('\n')

const TOOLBAR_PRESET_CONTEXT: AcUiDefaultToolbarContext = {
  getTheme: () => 'dark',
  setTheme: () => undefined,
  getLocale: () => 'en',
  setLocale: () => undefined,
  getPlacement: () => 'right',
  setPlacement: () => undefined
}

/**
 * Built-in export submenu with HTML/PDF commands that export immediately.
 *
 * The stock `chtml` / `cpdf` commands only open command-line prompts. A toolbar
 * click then looks like a no-op unless those prompts are answered. SVG (`csvg`)
 * already downloads without prompts.
 */
function createImmediateExportItem(): AcUiToolbarItem | undefined {
  const preset = acuiCreateDefaultToolbarPresetMap(TOOLBAR_PRESET_CONTEXT).get(
    'export'
  )
  if (!preset?.children) {
    return undefined
  }

  return {
    ...preset,
    children: preset.children.map(child => {
      if (child.id === 'export-html') {
        return { ...child, command: EXPORT_HTML_COMMAND }
      }
      if (child.id === 'export-pdf') {
        return { ...child, command: EXPORT_PDF_COMMAND }
      }
      return child
    })
  }
}

/**
 * Default desktop/pad toolbar, with Export HTML / Export PDF wired to download
 * using plugin defaults.
 */
function createToolbarItems(): AcUiToolbarItemConfig[] {
  const exportItem = createImmediateExportItem()
  return [
    acuiToolbarPreset('select'),
    acuiToolbarPreset('pan'),
    acuiToolbarPreset('zoom-extent'),
    acuiToolbarPreset('zoom-window'),
    acuiToolbarPreset('layer'),
    acuiToolbarPreset('layout'),
    acuiToolbarPreset('measure'),
    acuiToolbarPreset('annotation'),
    ...(exportItem ? [exportItem] : [acuiToolbarPreset('export')]),
    acuiCreateToolbarSeparator('sep-settings'),
    acuiToolbarPreset('settings')
  ]
}

let isLazyPluginRegistered = false
let isSimpleUiRegistered = false

/**
 * Registers lazy export plugins (HTML / PDF / SVG).
 *
 * Import from each plugin's `/register` subpath so only the registration stub is in the
 * initial bundle; plugin code loads when a trigger command runs.
 *
 * When {@link AcApDocManager.disableExport} is true, HTML/SVG plugins are skipped and
 * the PDF plugin only exposes `ipdf`.
 *
 * `viewerRuntimeUrl` is configured on the HTML plugin — not on `AcApDocManager`.
 * Opening DXF/DWG does not require `@mlightcad/cad-html-plugin` or that file.
 */
export const registerLazyPlugins = (): void => {
  if (isLazyPluginRegistered) {
    return
  }

  const pluginManager = AcApDocManager.instance.pluginManager
  const disableExport = AcApDocManager.instance.disableExport

  registerLazyPdfPlugin(pluginManager, { disableExport })
  if (!disableExport) {
    registerLazyHtmlPlugin(pluginManager, {
      viewerRuntimeUrl: HTML_VIEWER_RUNTIME_URL
    })
    registerLazySvgPlugin(pluginManager)
  }

  isLazyPluginRegistered = true
}

/**
 * Loads the simple UI plugin with this example's default toolbar layout.
 *
 * When {@link AcApDocManager.disableExport} is true, the export toolbar item is
 * omitted via `toolbar.excludeItems`.
 *
 * @param host - Viewer pane element that hosts toolbar overlays.
 */
export const registerSimpleUi = async (host: HTMLElement): Promise<void> => {
  if (isSimpleUiRegistered) {
    return
  }

  const disableExport = AcApDocManager.instance.disableExport

  await acuiRegisterSimpleUiPlugin(AcApDocManager.instance.pluginManager, {
    host,
    dockPanel: {
      defaultOpen: false,
      defaultSide: 'left',
      defaultHeight: 240,
      defaultWidth: 280
    },
    toolbar: {
      placement: 'right',
      // Custom list keeps the default tools, but Export HTML / PDF download
      // immediately. `items: 'default'` leaves those buttons on command-line prompts.
      items: disableExport ? 'default' : createToolbarItems(),
      collapsible: true,
      // Keep export out of the default toolbar when createInstance({ disableExport: true }).
      ...(disableExport ? { excludeItems: ['export'] } : {})
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
