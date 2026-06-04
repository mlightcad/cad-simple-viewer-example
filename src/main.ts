import { registerLazyHtmlPlugin } from '@mlightcad/cad-html-plugin'
import { registerLazyPdfPlugin } from '@mlightcad/cad-pdf-plugin'
import { AcApDocManager, AcEdCommandStack } from '@mlightcad/cad-simple-viewer'
import { registerLazySvgPlugin } from '@mlightcad/cad-svg-plugin'
import { AcDbOpenDatabaseOptions } from '@mlightcad/data-model'
import { DocCreator } from './docCreator'
import { AcApEllipseCmd } from './ellipseCmd'
import { initializeLocale } from './i8n'

/**
 * Plugin export command names registered by the official HTML, PDF, and SVG packages.
 *
 * These strings are passed to {@link AcApDocManager.sendStringToExecute} and also serve
 * as lazy-load triggers for their respective plugins.
 *
 * @see https://github.com/mlightcad/cad-viewer/wiki/Plugin-System
 */
type ExportCommandName = 'chtml' | 'cpdf' | 'csvg'

/**
 * Toast notification severity used by {@link CadViewerApp.showMessage}.
 */
type MessageType = 'success' | 'error' | 'info'

/**
 * Application shell that wires the example HTML UI to `AcApDocManager`.
 *
 * Responsibilities:
 * - Lazy-initialize the CAD viewer on first user action (open file or new drawing)
 * - Register demo commands and lazy export plugins (HTML / PDF / SVG)
 * - Handle local DXF/DWG file open, sample drawing creation, and export toolbar actions
 * - Reflect document state in the DOM (toolbar position, export button visibility)
 *
 * The viewer is not created at construction time; call {@link CadViewerApp.initialize}
 * indirectly via file open or **New** so the initial page load stays lightweight.
 *
 * @example
 * ```typescript
 * // Bootstrapped at the bottom of this module when the DOM is ready
 * new CadViewerApp()
 * ```
 */
class CadViewerApp {
  /**
   * Host element passed to `AcApDocManager.createInstance` as the WebGL/view canvas parent.
   * Corresponds to `#cad-container` in `index.html`.
   */
  private container: HTMLDivElement

  /**
   * Hidden `<input type="file">` used by the **Open** FAB to pick local `.dxf` / `.dwg` files.
   * Corresponds to `#fileInputElement`.
   */
  private fileInput: HTMLInputElement

  /**
   * Wrapper around the **Open** FAB and label (`#openButtonContainer`).
   * Hidden while a file is loading; see `loading-file` on `#fileInputContainer`.
   */
  private openButtonContainer: HTMLElement

  /**
   * Wrapper around the **New** FAB and label (`#newButtonContainer`).
   * Hidden during file load and permanently after a successful open or new drawing.
   */
  private newButtonContainer: HTMLElement

  /**
   * **New** button that populates the current document with {@link DocCreator} sample geometry.
   * Hidden after the first new drawing or file open via {@link CadViewerApp.hideNewButton}.
   */
  private newDrawingButton: HTMLButtonElement

  /**
   * Toolbar control that runs the `chtml` command (lazy {@link registerLazyHtmlPlugin}).
   * Visible only after a file is opened successfully; see `show-export` in `index.html`.
   */
  private exportHtmlButton: HTMLButtonElement

  /**
   * Toolbar control that runs the `cpdf` command (lazy {@link registerLazyPdfPlugin}).
   */
  private exportPdfButton: HTMLButtonElement

  /**
   * Toolbar control that runs the `csvg` command (lazy {@link registerLazySvgPlugin}).
   */
  private exportSvgButton: HTMLButtonElement

  /**
   * Whether {@link AcApDocManager.createInstance} has completed for this page session.
   * Stays false until the user opens a file or clicks **New**.
   */
  private isInitialized: boolean = false

  /**
   * Whether a DXF/DWG file was opened successfully in this session.
   *
   * When true, export commands are allowed and the export toolbar is shown.
   * Remains false if the user only created a drawing via **New** (export UI stays hidden).
   */
  private hasLoadedDocument: boolean = false

  /**
   * Binds DOM references from `index.html` and registers UI event listeners.
   *
   * Does not initialize the CAD viewer; initialization is deferred until
   * {@link CadViewerApp.loadFile} or the **New** button handler runs.
   */
  constructor() {
    this.container = document.getElementById('cad-container') as HTMLDivElement
    this.fileInput = document.getElementById('fileInputElement') as HTMLInputElement
    this.openButtonContainer = document.getElementById(
      'openButtonContainer'
    ) as HTMLElement
    this.newButtonContainer = document.getElementById(
      'newButtonContainer'
    ) as HTMLElement
    this.newDrawingButton = document.getElementById('newDrawingButton') as HTMLButtonElement
    this.exportHtmlButton = document.getElementById(
      'exportHtmlButton'
    ) as HTMLButtonElement
    this.exportPdfButton = document.getElementById(
      'exportPdfButton'
    ) as HTMLButtonElement
    this.exportSvgButton = document.getElementById(
      'exportSvgButton'
    ) as HTMLButtonElement

    this.setupFileHandling()
    this.setupNewDrawingHandling()
    this.setupExportHandling()
  }

  /**
   * Creates the singleton `AcApDocManager` and registers commands, plugins, and listeners.
   *
   * Configuration highlights:
   * - `webworkerFileUrls` — parser and MTEXT worker scripts copied to `dist/assets/`
   * - `htmlViewerRuntimeUrl` — runtime bundle required for offline HTML export (`chtml`)
   * - `baseUrl` — optional CDN root for built-in resources (demo override)
   *
   * Idempotent: subsequent calls are no-ops once {@link CadViewerApp.isInitialized} is true.
   *
   * @remarks On failure, logs to the console and shows an error toast via {@link CadViewerApp.showMessage}.
   */
  private initialize(): void {
    if (!this.isInitialized) {
      try {
        AcApDocManager.createInstance({
          container: this.container,
          autoResize: true,
          baseUrl: 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/',
          webworkerFileUrls: {
            mtextRender: './assets/mtext-renderer-worker.js',
            dxfParser: './assets/dxf-parser-worker.js',
            dwgParser: './assets/libredwg-parser-worker.js'
          },
          htmlViewerRuntimeUrl: './assets/viewer-runtime.iife.js'
        })
        initializeLocale()
        this.registerCommands()
        this.registerLazyPlugins()

        AcApDocManager.instance.events.documentActivated.addEventListener(
          args => {
            document.title = args.doc.docTitle
          }
        )

        this.isInitialized = true
      } catch (error) {
        console.error('Failed to initialize CAD viewer:', error)
        this.showMessage('Failed to initialize CAD viewer', 'error')
      }
    }
  }

  /**
   * Registers example custom commands on the system command group.
   *
   * Currently adds `ellipsedemo` ({@link AcApEllipseCmd}) for interactive ellipse creation.
   *
   * @remarks Must run after {@link CadViewerApp.initialize} so `commandManager` exists.
   */
  private registerCommands(): void {
    const register = AcApDocManager.instance.commandManager
    register.addCommand(
      AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
      'ellipsedemo',
      'ellipsedemo',
      new AcApEllipseCmd()
    )
  }

  /**
   * Registers lazy export plugins on `AcApDocManager.instance.pluginManager`.
   *
   * Plugin code is not downloaded until the user runs a trigger command:
   *
   * | Package | Trigger commands |
   * |---------|------------------|
   * | `@mlightcad/cad-html-plugin` | `chtml` |
   * | `@mlightcad/cad-pdf-plugin` | `cpdf`, `ipdf` |
   * | `@mlightcad/cad-svg-plugin` | `csvg` |
   *
   * Safe to call only once per application lifetime (guarded by {@link CadViewerApp.initialize}).
   *
   * @see https://github.com/mlightcad/cad-viewer/wiki/Plugin-System
   */
  private registerLazyPlugins(): void {
    const pluginManager = AcApDocManager.instance.pluginManager
    registerLazyHtmlPlugin(pluginManager)
    registerLazyPdfPlugin(pluginManager)
    registerLazySvgPlugin(pluginManager)
  }

  /**
   * Attaches a `change` listener to the hidden file input for local DXF/DWG open.
   *
   * Clears the input value after each selection so the same file can be chosen again.
   */
  private setupFileHandling(): void {
    this.fileInput.addEventListener('change', event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (file) {
        void this.loadFile(file)
      }
      this.fileInput.value = ''
    })
  }

  /**
   * Hides **Open** and **New** while a DXF/DWG file is being read and opened.
   *
   * Toggles the `loading-file` class on `#fileInputContainer` (see `index.html` CSS).
   */
  private setFileLoadingUi(loading: boolean): void {
    const fileInputContainer = document.getElementById('fileInputContainer')
    fileInputContainer?.classList.toggle('loading-file', loading)
  }

  /**
   * Hides the **New** entry control after the user has started a session.
   *
   * Called after a successful file open or after creating the sample drawing.
   */
  private hideNewButton(): void {
    this.newButtonContainer.style.display = 'none'
  }

  /**
   * Restores **Open** and **New** on the home screen after a failed file open.
   */
  private restoreEntryButtons(): void {
    this.openButtonContainer.style.display = ''
    this.newButtonContainer.style.display = ''
  }

  /**
   * Wires click handlers on the HTML / PDF / SVG export toolbar buttons.
   *
   * Each handler delegates to {@link CadViewerApp.runExportCommand} with the
   * matching plugin trigger command name.
   */
  private setupExportHandling(): void {
    this.exportHtmlButton.addEventListener('click', () => {
      this.runExportCommand('chtml')
    })
    this.exportPdfButton.addEventListener('click', () => {
      this.runExportCommand('cpdf')
    })
    this.exportSvgButton.addEventListener('click', () => {
      this.runExportCommand('csvg')
    })
  }

  /**
   * Executes an export plugin command if the viewer and a opened file are ready.
   *
   * `sendStringToExecute` loads the matching lazy plugin on first use when needed.
   *
   * @param command - Plugin trigger: `chtml`, `cpdf`, or `csvg`
   */
  private runExportCommand(command: ExportCommandName): void {
    if (!this.hasLoadedDocument || !this.isInitialized) {
      return
    }
    AcApDocManager.instance.sendStringToExecute(command)
  }

  /**
   * Updates UI state after a local DXF/DWG file is opened successfully.
   *
   * - Sets {@link CadViewerApp.hasLoadedDocument} to true
   * - Adds `loaded` and `show-export` classes on `#fileInputContainer` (toolbar layout + export buttons)
   * - Enables export FABs via {@link CadViewerApp.updateExportButtonsState}
   */
  private onFileOpened(): void {
    this.hasLoadedDocument = true
    const fileInputContainer = document.getElementById('fileInputContainer')
    if (fileInputContainer) {
      fileInputContainer.classList.add('loaded', 'show-export')
    }
    this.updateExportButtonsState()
  }

  /**
   * Syncs the `disabled` attribute on export buttons with viewer and document readiness.
   *
   * Export actions require both {@link CadViewerApp.isInitialized} and
   * {@link CadViewerApp.hasLoadedDocument}.
   */
  private updateExportButtonsState(): void {
    const enabled = this.hasLoadedDocument && this.isInitialized
    this.exportHtmlButton.disabled = !enabled
    this.exportPdfButton.disabled = !enabled
    this.exportSvgButton.disabled = !enabled
  }

  /**
   * Handles **New** — fills the active document with {@link DocCreator.createExampleDoc2}
   * and fits the view.
   *
   * Does not show export buttons (no `show-export` class); only file open does.
   * Moves the FAB toolbar to the corner via the `loaded` class on `#fileInputContainer`.
   */
  private setupNewDrawingHandling(): void {
    this.newDrawingButton.addEventListener('click', () => {
      this.initialize()
      const docManager = AcApDocManager.instance
      if (!docManager) {
        this.showMessage('CAD viewer not initialized', 'error')
        return
      }
      const doc = docManager.curDocument
      if (doc) {
        const fileInputContainer = document.getElementById('fileInputContainer')
        if (fileInputContainer) {
          fileInputContainer.classList.add('loaded')
        }

        DocCreator.instance.createExampleDoc2(doc.database)
        docManager.setActiveLayout()
        docManager.curView.zoomToFitDrawing()

        this.hideNewButton()
      }
    })
  }

  /**
   * Reads a local file, validates extension, and opens it in the viewer.
   *
   * Flow:
   * 1. {@link CadViewerApp.initialize}
   * 2. Reject non-`.dxf` / non-`.dwg` names with an error toast
   * 3. Hide **Open** / **New** via {@link CadViewerApp.setFileLoadingUi} until loading finishes
   * 4. {@link CadViewerApp.readFile} → `openDocument` with read-only options
   * 5. On success, {@link CadViewerApp.onFileOpened} and a success toast; on failure, {@link CadViewerApp.restoreEntryButtons}
   *
   * @param file - User-selected file from the file input
   */
  private async loadFile(file: File): Promise<void> {
    this.initialize()

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.dxf') && !fileName.endsWith('.dwg')) {
      this.showMessage('Please select a DXF or DWG file', 'error')
      return
    }

    this.clearMessages()
    this.setFileLoadingUi(true)

    try {
      const fileContent = await this.readFile(file)

      const options: AcDbOpenDatabaseOptions = {
        minimumChunkSize: 1000,
        readOnly: true
      }

      const success = await AcApDocManager.instance.openDocument(
        file.name,
        fileContent,
        options
      )

      if (success) {
        this.hideNewButton()
        this.onFileOpened()
        this.showMessage(`Successfully loaded: ${file.name}`, 'success')
      } else {
        this.restoreEntryButtons()
        this.showMessage(`Failed to load: ${file.name}`, 'error')
      }
    } catch (error) {
      console.error('Error loading file:', error)
      this.restoreEntryButtons()
      this.showMessage(`Error loading file: ${error}`, 'error')
    } finally {
      this.setFileLoadingUi(false)
    }
  }

  /**
   * Reads a `File` as raw binary via `FileReader.readAsArrayBuffer`.
   *
   * @param file - Browser `File` object from the file picker
   * @returns Promise that resolves to the file contents as `ArrayBuffer`
   * @throws Rejects with the `FileReader` error if reading fails
   */
  private readFile(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(file)
    })
  }

  /**
   * Shows a short-lived centered toast at the top of the viewport.
   *
   * Replaces any existing `.popup-message` elements before creating a new one.
   * Fades out after ~1s and removes the node from the DOM.
   *
   * @param message - Text shown to the user
   * @param type - Controls background and border colors (`success`, `error`, or `info`)
   */
  private showMessage(message: string, type: MessageType = 'info'): void {
    this.clearMessages()

    const popup = document.createElement('div')
    popup.className = `popup-message ${type}`
    popup.textContent = message
    popup.style.position = 'fixed'
    popup.style.top = '2rem'
    popup.style.left = '50%'
    popup.style.transform = 'translateX(-50%)'
    popup.style.zIndex = '1000'
    popup.style.padding = '1rem 2rem'
    popup.style.borderRadius = '8px'
    popup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
    popup.style.fontSize = '1.1rem'
    popup.style.opacity = '0.98'
    popup.style.transition = 'opacity 0.2s'
    if (type === 'error') {
      popup.style.background = '#ffe6e6'
      popup.style.color = '#dc3545'
      popup.style.border = '1px solid #ffcccc'
    } else if (type === 'success') {
      popup.style.background = '#e6ffe6'
      popup.style.color = '#28a745'
      popup.style.border = '1px solid #ccffcc'
    } else {
      popup.style.background = '#f0f0f0'
      popup.style.color = '#333'
      popup.style.border = '1px solid #ccc'
    }

    document.body.appendChild(popup)

    setTimeout(() => {
      popup.style.opacity = '0'
      setTimeout(() => {
        if (popup.parentNode) {
          popup.parentNode.removeChild(popup)
        }
      }, 200)
    }, 1000)
  }

  /**
   * Removes all in-flight toast elements (class `popup-message`) from `document.body`.
   */
  private clearMessages(): void {
    document.querySelectorAll('.popup-message').forEach(el => el.remove())
  }
}

/**
 * Starts the example application once the DOM is ready.
 *
 * If the script runs after `DOMContentLoaded`, constructs {@link CadViewerApp} immediately;
 * otherwise waits for that event.
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new CadViewerApp()
  })
} else {
  new CadViewerApp()
}
