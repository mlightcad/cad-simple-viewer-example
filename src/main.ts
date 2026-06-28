import {
  AcApDocManager,
  AcApOpenViewMode,
  AcEdCommandStack,
  AcEdOpenMode,
  applyUiTheme,
  type AcApOpenDatabaseOptions
} from '@mlightcad/cad-simple-viewer'
import { AcApEllipseCmd } from './ellipseCmd'
import { initializeLocale } from './i8n'
import { registerPlugins } from './register'
import { WEBWORKER_FILE_URLS } from './workerConfig'

/**
 * Toast notification severity used by {@link CadViewerApp.showMessage}.
 */
type MessageType = 'success' | 'error' | 'info'

/**
 * Upload-screen value for initial view when the user leaves the choice on **Auto**.
 */
type OpenViewModeChoice = 'auto' | AcApOpenViewMode

/**
 * Open options collected from the upload screen before a file is loaded.
 */
interface OpenOptions {
  /** Database access mode passed to {@link AcApOpenDatabaseOptions.mode}. */
  mode: AcEdOpenMode
  /** Whether MTEXT is rendered on the main thread (fixed after first {@link CadViewerApp.initialize}). */
  useMainThreadDraw: boolean
  /** Whether non-plottable layers are drawn ({@link AcApOpenDatabaseOptions.drawNoPlotLayers}). */
  drawNoPlotLayers: boolean
  /** Whether geometry is shown incrementally while the file converts. */
  progressiveRendering: boolean
  /** How the view is framed after open; omitted when the user selects **Auto**. */
  openViewMode?: AcApOpenViewMode
}

/**
 * Application shell that wires the example HTML UI to `AcApDocManager`.
 *
 * Responsibilities:
 * - Lazy-initialize the CAD viewer on first file open
 * - Register demo commands, lazy export plugins (HTML / PDF / SVG), and the simple UI plugin
 * - Handle local DXF/DWG file open with configurable open options
 * - Reflect document state in the DOM (upload screen vs viewer)
 *
 * The viewer is not created at construction time; call {@link CadViewerApp.initialize}
 * indirectly via file open so the initial page load stays lightweight.
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
   * Viewer pane that hosts the CAD canvas and simple UI plugin overlays.
   * Corresponds to `#viewerPane` in `index.html`.
   */
  private viewerPane: HTMLElement

  /**
   * Full-screen upload overlay shown before a drawing is opened.
   * Corresponds to `#uploadScreen` in `index.html`.
   */
  private uploadScreen: HTMLElement

  /**
   * Click/drop target inside the upload panel that triggers the hidden file input.
   * Corresponds to `#uploadDropzone` in `index.html`.
   */
  private uploadDropzone: HTMLElement

  /**
   * Hidden `<input type="file">` used to pick local `.dxf` / `.dwg` files.
   * Corresponds to `#fileInputElement`.
   */
  private fileInput: HTMLInputElement

  /**
   * Compact **Open** control shown in the viewer corner after a file loads successfully.
   * Corresponds to `#reopenButton` in `index.html`.
   */
  private reopenButton: HTMLButtonElement

  /**
   * Hint text under the text-rendering option group.
   * Corresponds to `#textRenderingHint` in `index.html`.
   */
  private textRenderingHint: HTMLElement

  /**
   * Hint text under the progressive-rendering option group.
   * Corresponds to `#progressiveRenderingHint` in `index.html`.
   */
  private progressiveRenderingHint: HTMLElement

  /**
   * Hint text under the non-plottable-layers option group.
   * Corresponds to `#noPlotLayersHint` in `index.html`.
   */
  private noPlotLayersHint: HTMLElement

  /**
   * Whether {@link AcApDocManager.createInstance} has completed for this page session.
   * Stays false until the user opens a file for the first time.
   */
  private isInitialized: boolean = false

  /**
   * `useMainThreadDraw` value passed to the first {@link CadViewerApp.initialize} call.
   * Used to warn when the user changes text rendering after the viewer is already running.
   */
  private initUseMainThreadDraw: boolean = false

  /**
   * Whether the user has opened at least one drawing in this session.
   * Used to keep the corner **Open** button visible after subsequent opens.
   */
  private hasOpenedFile: boolean = false

  /**
   * Binds DOM references from `index.html` and registers UI event listeners.
   *
   * Does not initialize the CAD viewer; initialization is deferred until
   * {@link CadViewerApp.loadFile} runs.
   */
  constructor() {
    this.container = document.getElementById('cad-container') as HTMLDivElement
    this.viewerPane = document.getElementById('viewerPane') as HTMLElement
    this.uploadScreen = document.getElementById('uploadScreen') as HTMLElement
    this.uploadDropzone = document.getElementById('uploadDropzone') as HTMLElement
    this.fileInput = document.getElementById('fileInputElement') as HTMLInputElement
    this.reopenButton = document.getElementById('reopenButton') as HTMLButtonElement
    this.textRenderingHint = document.getElementById('textRenderingHint') as HTMLElement
    this.progressiveRenderingHint = document.getElementById(
      'progressiveRenderingHint'
    ) as HTMLElement
    this.noPlotLayersHint = document.getElementById('noPlotLayersHint') as HTMLElement

    this.setupOptionGroups()
    this.setupFileHandling()
    this.setupReopenHandling()
  }

  /**
   * Wires click handlers on every `[data-option-group]` segment on the upload screen.
   *
   * Toggles the `is-active` class and `aria-checked` on the clicked option and
   * refreshes the descriptive hint for that group.
   */
  private setupOptionGroups(): void {
    document.querySelectorAll('[data-option-group]').forEach(group => {
      group.addEventListener('click', event => {
        const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
          'button[data-value]'
        )
        if (!target || !group.contains(target)) {
          return
        }

        group.querySelectorAll('button[data-value]').forEach(button => {
          const isActive = button === target
          button.classList.toggle('is-active', isActive)
          button.setAttribute('aria-checked', String(isActive))
        })

        this.updateOptionHints(group.getAttribute('data-option-group'))
      })
    })
  }

  /**
   * Updates the helper text below an open-option group after the user changes a choice.
   *
   * @param groupName - Value of `data-option-group` (`textRendering`, `progressiveRendering`, or `noPlotLayers`)
   */
  private updateOptionHints(groupName: string | null): void {
    if (groupName === 'textRendering') {
      const useMain = this.getSelectedValue('textRendering') === 'main'
      this.textRenderingHint.textContent = useMain
        ? 'Slower, less memory'
        : 'Faster, more memory'
    } else if (groupName === 'progressiveRendering') {
      const enabled = this.getSelectedValue('progressiveRendering') === 'true'
      this.progressiveRenderingHint.textContent = enabled
        ? 'Show geometry while loading'
        : 'Wait until fully converted'
    } else if (groupName === 'noPlotLayers') {
      const show = this.getSelectedValue('noPlotLayers') === 'true'
      this.noPlotLayersHint.textContent = show
        ? 'AutoCAD editor semantics'
        : 'Web viewer default'
    }
  }

  /**
   * Returns the `data-value` of the active button inside an open-option group.
   *
   * @param groupName - Value of `data-option-group` on the segment container
   * @returns Selected option value, or an empty string when nothing is active
   */
  private getSelectedValue(groupName: string): string {
    const active = document.querySelector(
      `[data-option-group="${groupName}"] button.is-active`
    ) as HTMLButtonElement | null
    return active?.dataset.value ?? ''
  }

  /**
   * Reads the current upload-screen choices into an {@link OpenOptions} object.
   *
   * @returns Options applied on the next {@link CadViewerApp.loadFile} call
   */
  private readOpenOptions(): OpenOptions {
    const openViewChoice = this.getSelectedValue('openViewMode') as OpenViewModeChoice
    const openViewMode =
      openViewChoice === 'auto' ? undefined : (openViewChoice as AcApOpenViewMode)

    return {
      mode: Number(this.getSelectedValue('accessMode')) as AcEdOpenMode,
      useMainThreadDraw: this.getSelectedValue('textRendering') === 'main',
      drawNoPlotLayers: this.getSelectedValue('noPlotLayers') === 'true',
      progressiveRendering: this.getSelectedValue('progressiveRendering') === 'true',
      openViewMode
    }
  }

  /**
   * Creates the singleton `AcApDocManager` and registers commands, plugins, and listeners.
   *
   * Configuration highlights:
   * - `webworkerFileUrls` — parser and MTEXT worker scripts copied to `dist/assets/`
   * - `checkWorkersOnInit` — probe worker URLs after registration (see {@link WEBWORKER_FILE_URLS})
   * - `htmlViewerRuntimeUrl` — runtime bundle required for offline HTML export (`chtml`)
   * - `baseUrl` — optional CDN root for built-in resources (demo override)
   * - `useMainThreadDraw` — MTEXT render mode; fixed for the lifetime of the page session
   *
   * Before `createInstance`, {@link AcApDocManager.checkWebworkerReadiness} verifies
   * that worker scripts respond without downloading large bundles (HEAD + ranged GET fallback).
   *
   * Idempotent: subsequent calls are no-ops once {@link CadViewerApp.isInitialized} is true.
   *
   * @param useMainThreadDraw - When `true`, MTEXT is rendered on the main thread instead of a worker
   * @returns `true` when the viewer is ready; `false` when worker checks or init failed
   * @remarks On failure, logs to the console and shows an error toast via {@link CadViewerApp.showMessage}.
   */
  private async initialize(useMainThreadDraw: boolean): Promise<boolean> {
    if (this.isInitialized) {
      return true
    }

    try {
      applyUiTheme('dark', this.viewerPane)

      const workersReachable = await AcApDocManager.checkWebworkerReadiness(
        WEBWORKER_FILE_URLS
      )
      if (!workersReachable) {
        console.error(
          'CAD worker scripts are missing or blocked:',
          WEBWORKER_FILE_URLS
        )
        this.showMessage(
          'CAD worker scripts are missing. Ensure parser workers are deployed to assets/.',
          'error'
        )
        return false
      }

      AcApDocManager.createInstance({
        container: this.container,
        busyIndicatorHost: this.viewerPane,
        autoResize: true,
        baseUrl: 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/',
        webworkerFileUrls: WEBWORKER_FILE_URLS,
        checkWorkersOnInit: true,
        useMainThreadDraw,
        htmlViewerRuntimeUrl: './assets/viewer-runtime.iife.js'
      })

      const docManager = AcApDocManager.instance

      docManager.events.workersReady.addEventListener(({ ready }) => {
        if (!ready) {
          console.error('CAD worker scripts are not reachable')
          this.showMessage('CAD worker scripts are not reachable', 'error')
        }
      })

      docManager.events.documentToBeOpened.addEventListener(() => {
        this.setUploadLoading(true)
      })

      initializeLocale()
      this.registerCommands()
      await registerPlugins(this.viewerPane)

      docManager.events.documentActivated.addEventListener(args => {
        document.title = args.doc.docTitle
        if (this.hasOpenedFile) {
          this.showReopenButton()
        }
      })

      this.isInitialized = true
      this.initUseMainThreadDraw = useMainThreadDraw
      return true
    } catch (error) {
      console.error('Failed to initialize CAD viewer:', error)
      this.showMessage('Failed to initialize CAD viewer', 'error')
      return false
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
   * Attaches drag-and-drop, keyboard, and `change` listeners for local file open.
   *
   * Clears the hidden file input value after each selection so the same file can be chosen again.
   */
  private setupFileHandling(): void {
    this.uploadDropzone.addEventListener('click', () => {
      this.fileInput.click()
    })

    this.uploadDropzone.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        this.fileInput.click()
      }
    })

    this.uploadDropzone.addEventListener('dragover', event => {
      event.preventDefault()
      this.uploadDropzone.classList.add('is-dragover')
    })

    this.uploadDropzone.addEventListener('dragleave', () => {
      this.uploadDropzone.classList.remove('is-dragover')
    })

    this.uploadDropzone.addEventListener('drop', event => {
      event.preventDefault()
      this.uploadDropzone.classList.remove('is-dragover')
      const file = event.dataTransfer?.files?.[0]
      if (file) {
        void this.loadFile(file)
      }
    })

    this.fileInput.addEventListener('change', event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (file) {
        void this.loadFile(file)
      }
      this.fileInput.value = ''
    })
  }

  /**
   * Runs the built-in **OPEN** command when the corner **Open** button is clicked.
   */
  private setupReopenHandling(): void {
    this.reopenButton.addEventListener('click', () => {
      if (!this.isInitialized) {
        return
      }
      AcApDocManager.instance.sendStringToExecute('open')
    })
  }

  /**
   * Hides the upload overlay while a document is opening so the viewer loading indicator is visible.
   *
   * Triggered from the `documentToBeOpened` event and when {@link CadViewerApp.loadFile}
   * begins opening a file.
   *
   * @param loading - When `true`, hides the upload screen
   */
  private setUploadLoading(loading: boolean): void {
    if (loading) {
      this.uploadScreen.classList.add('is-hidden')
    }
  }

  /**
   * Restores the full upload screen (home page) after a failed open from the upload flow.
   */
  private showUploadScreen(): void {
    this.uploadScreen.classList.remove('is-hidden')
    this.reopenButton.classList.remove('is-visible')
  }

  /**
   * Shows the compact corner **Open** button while keeping the upload screen hidden.
   */
  private showReopenButton(): void {
    this.uploadScreen.classList.add('is-hidden')
    this.reopenButton.classList.add('is-visible')
  }

  /**
   * Hides the upload screen and shows the compact corner **Open** button after a successful load.
   */
  private hideUploadScreen(): void {
    this.hasOpenedFile = true
    this.showReopenButton()
  }

  /**
   * Reads a local file, validates extension, and opens it in the viewer.
   *
   * Flow:
   * 1. {@link CadViewerApp.readOpenOptions} → {@link CadViewerApp.initialize}
   * 2. Reject non-`.dxf` / non-`.dwg` names with an error toast
   * 3. Hide the upload screen via `documentToBeOpened` while the viewer shows its loading indicator
   * 4. {@link CadViewerApp.readFile} → `openDocument` with upload-screen options
   * 5. On success, {@link CadViewerApp.hideUploadScreen} and a success toast; on failure, {@link CadViewerApp.showUploadScreen}
   *
   * @param file - User-selected file from the file input or drop zone
   */
  private async loadFile(file: File): Promise<void> {
    const openOptions = this.readOpenOptions()

    if (
      this.isInitialized &&
      openOptions.useMainThreadDraw !== this.initUseMainThreadDraw
    ) {
      this.showMessage(
        'Text rendering mode applies on first load. Reload the page to change it.',
        'info'
      )
    }

    if (!(await this.initialize(openOptions.useMainThreadDraw))) {
      return
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.dxf') && !fileName.endsWith('.dwg')) {
      this.showMessage('Please select a DXF or DWG file', 'error')
      return
    }

    this.clearMessages()

    try {
      const docManager = AcApDocManager.instance
      if (!(await docManager.areWorkersReady())) {
        this.showMessage(
          'CAD worker scripts are not reachable. Check deployment of assets/*-worker.js.',
          'error'
        )
        return
      }

      const fileContent = await this.readFile(file)

      const options: AcApOpenDatabaseOptions = {
        minimumChunkSize: 1000,
        mode: openOptions.mode,
        drawNoPlotLayers: openOptions.drawNoPlotLayers,
        progressiveRendering: openOptions.progressiveRendering,
        ...(openOptions.openViewMode != null
          ? { openViewMode: openOptions.openViewMode }
          : {})
      }

      const success = await docManager.openDocument(
        file.name,
        fileContent,
        options
      )

      if (success) {
        this.hideUploadScreen()
        this.showMessage(`Successfully loaded: ${file.name}`, 'success')
      } else {
        this.showUploadScreen()
        this.showMessage(`Failed to load: ${file.name}`, 'error')
      }
    } catch (error) {
      console.error('Error loading file:', error)
      this.showUploadScreen()
      this.showMessage(`Error loading file: ${error}`, 'error')
    }
  }

  /**
   * Reads a `File` as raw binary via `FileReader.readAsArrayBuffer`.
   *
   * @param file - Browser `File` object from the file picker or drop zone
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
        popup.parentNode?.removeChild(popup)
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
