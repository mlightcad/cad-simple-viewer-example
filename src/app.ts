import type {
  AcApDocManager,
  AcApOpenDatabaseOptions,
  AcApOpenViewMode,
  AcEdOpenMode,
  AcUiFileOpenPanel
} from '@mlightcad/cad-simple-viewer'
import {
  loadCadSimpleViewer,
  preloadViewerAppModules,
  scheduleViewerPreload
} from './viewerLoader'
import { WEBWORKER_FILE_URLS } from './workerConfig'

/** Matches cad-viewer-example FileUpload mobile collapse breakpoint. */
const MOBILE_MAX_WIDTH = '(max-width: 768px)'

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
  /** Circle/arc tessellation sides ({@link AcApOpenDatabaseOptions.circleSides}). */
  circleSides: number
  /** Paper-space canvas background RGB (e.g. `0xffffff` white, `0x000000` black). */
  paperSpaceBackground: number
  /**
   * When `true`, hide built-in export commands and skip HTML/SVG plugins
   * (fixed after first {@link CadViewerApp.initialize}).
   */
  disableExport: boolean
  /** How the view is framed after open; omitted when the user selects **Auto**. */
  openViewMode?: AcApOpenViewMode
}

/**
 * Options for {@link CadViewerApp}.
 */
export interface CadViewerAppOptions {
  /**
   * When `true` (default), registers lazy export plugins and the simple UI toolbar.
   * Set to `false` to run a bare `cad-simple-viewer` without any plugins.
   */
  enablePlugins?: boolean
}

/**
 * Application shell that wires the example HTML UI to `AcApDocManager`.
 *
 * Responsibilities:
 * - Keep the homepage free of a static `@mlightcad/cad-simple-viewer` import
 * - Mount {@link AcUiFileOpenPanel} on the landing screen (local / URL / new drawing)
 * - Preload viewer JS after first paint, then create the viewer on first file open
 * - Optionally register demo commands, lazy export plugins, and the simple UI plugin
 * - Handle local / URL DXF/DWG open with configurable open options
 * - Reflect document state in the DOM (upload screen vs viewer)
 *
 * The viewer package and `AcApDocManager.createInstance` are deferred until needed;
 * {@link scheduleViewerPreload} warms the module cache in the background.
 */
export class CadViewerApp {
  /**
   * Host element passed to `AcApDocManager.createInstance` as the WebGL/view canvas parent.
   * Corresponds to `#cad-container` in the page HTML.
   */
  private container: HTMLDivElement

  /**
   * Viewer pane that hosts the CAD canvas and (when enabled) simple UI plugin overlays.
   * Corresponds to `#viewerPane` in the page HTML.
   */
  private viewerPane: HTMLElement

  /**
   * Full-screen upload overlay shown before a drawing is opened.
   * Corresponds to `#uploadScreen` in the page HTML.
   */
  private uploadScreen: HTMLElement

  /**
   * Host element for {@link AcUiFileOpenPanel} on the upload screen.
   * Corresponds to `#fileOpenHost` in the page HTML.
   */
  private fileOpenHost: HTMLElement

  /**
   * Landing-page open panel (local file / URL / new drawing).
   * Created asynchronously via {@link CadViewerApp.mountFileOpenPanel}.
   */
  private fileOpenPanel: AcUiFileOpenPanel | null = null

  /**
   * Compact **Open** control shown in the viewer corner after a file loads successfully.
   * Corresponds to `#reopenButton` in the page HTML.
   */
  private reopenButton: HTMLButtonElement

  /**
   * Collapsible open-options section on the upload screen.
   * Corresponds to `#settingsSection` in the page HTML.
   */
  private settingsSection: HTMLElement

  /**
   * Button that toggles open options on narrow viewports.
   * Corresponds to `#settingsHeader` in the page HTML.
   */
  private settingsHeader: HTMLButtonElement

  /**
   * Grid of open-option pills; hidden when settings are collapsed on mobile.
   * Corresponds to `#open-options-panel` in the page HTML.
   */
  private settingsPanel: HTMLElement

  /**
   * Whether the viewport currently matches the mobile upload layout.
   */
  private isMobileLayout = false

  /**
   * Whether open options are expanded while in the mobile layout.
   * Desktop always shows the options (see {@link CadViewerApp.syncSettingsExpanded}).
   */
  private settingsExpanded = true

  /**
   * `matchMedia` listener for the mobile upload breakpoint; cleared on page unload only.
   */
  private mobileMediaQuery: MediaQueryList | null = null

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
   * `disableExport` value passed to the first {@link CadViewerApp.initialize} call.
   * Used to warn when the user changes export availability after the viewer is already running.
   */
  private initDisableExport: boolean = false

  /**
   * Whether the user has opened at least one drawing in this session.
   * Used to keep the corner **Open** button visible after subsequent opens.
   */
  private hasOpenedFile: boolean = false

  /**
   * Whether to register export + simple UI plugins after `createInstance`.
   */
  private readonly enablePlugins: boolean

  /**
   * Cached `AcApDocManager` class after the viewer module has been loaded.
   * Set during {@link CadViewerApp.initialize}.
   */
  private DocManager: typeof AcApDocManager | null = null

  /**
   * Binds DOM references from the page HTML and registers UI event listeners.
   *
   * Does not load `@mlightcad/cad-simple-viewer` or create the CAD viewer;
   * schedules a background preload and initializes on first file open /
   * new drawing.
   *
   * @param options - App options; set `enablePlugins: false` for a bare viewer
   */
  constructor(options: CadViewerAppOptions = {}) {
    this.enablePlugins = options.enablePlugins !== false

    this.container = document.getElementById('cad-container') as HTMLDivElement
    this.viewerPane = document.getElementById('viewerPane') as HTMLElement
    this.uploadScreen = document.getElementById('uploadScreen') as HTMLElement
    this.fileOpenHost = document.getElementById('fileOpenHost') as HTMLElement
    this.reopenButton = document.getElementById('reopenButton') as HTMLButtonElement
    this.settingsSection = document.getElementById('settingsSection') as HTMLElement
    this.settingsHeader = document.getElementById(
      'settingsHeader'
    ) as HTMLButtonElement
    this.settingsPanel = document.getElementById(
      'open-options-panel'
    ) as HTMLElement

    this.setupOptionGroups()
    this.setupSettingsCollapse()
    this.setupReopenHandling()
    void this.mountFileOpenPanel()
    scheduleViewerPreload(this.enablePlugins)
  }

  /**
   * Wires click handlers on every `[data-option-group]` segment on the upload screen.
   *
   * Toggles the `is-active` class and `aria-checked` on the clicked option.
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
      })
    })
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
    const circleSidesRaw = Number(this.getSelectedValue('circleSides'))
    const paperBgRaw = Number.parseInt(
      this.getSelectedValue('paperSpaceBackground') || 'ffffff',
      16
    )

    return {
      mode: Number(this.getSelectedValue('accessMode')) as AcEdOpenMode,
      useMainThreadDraw: this.getSelectedValue('textRendering') === 'main',
      drawNoPlotLayers: this.getSelectedValue('noPlotLayers') === 'true',
      progressiveRendering: this.getSelectedValue('progressiveRendering') === 'true',
      circleSides: Number.isFinite(circleSidesRaw) ? circleSidesRaw : 50,
      paperSpaceBackground: Number.isFinite(paperBgRaw) ? paperBgRaw : 0xffffff,
      disableExport: this.getSelectedValue('disableExport') === 'true',
      openViewMode
    }
  }

  /**
   * Builds {@link AcApOpenDatabaseOptions} from upload-screen choices, including
   * paper-space background via `paperbkcolor`.
   */
  private buildDatabaseOpenOptions(
    openOptions: OpenOptions,
    layoutBackgroundColorFromRgb: (typeof import('@mlightcad/cad-simple-viewer'))['layoutBackgroundColorFromRgb'],
    extras: Partial<AcApOpenDatabaseOptions> = {}
  ): AcApOpenDatabaseOptions {
    return {
      mode: openOptions.mode,
      drawNoPlotLayers: openOptions.drawNoPlotLayers,
      progressiveRendering: openOptions.progressiveRendering,
      circleSides: openOptions.circleSides,
      sysVars: {
        paperbkcolor: layoutBackgroundColorFromRgb(openOptions.paperSpaceBackground)
      },
      ...(openOptions.openViewMode != null
        ? { openViewMode: openOptions.openViewMode }
        : {}),
      ...extras
    }
  }

  /**
   * Collects warnings when session-fixed options (text rendering / export) differ
   * from the values used on first {@link CadViewerApp.initialize}.
   *
   * Callers should surface these after {@link CadViewerApp.clearMessages} so the
   * toasts are not immediately removed.
   */
  private getSessionOptionWarnings(openOptions: OpenOptions): string[] {
    if (!this.isInitialized) {
      return []
    }
    const warnings: string[] = []
    if (openOptions.useMainThreadDraw !== this.initUseMainThreadDraw) {
      warnings.push(
        'Text rendering mode applies on first load. Reload the page to change it.'
      )
    }
    if (openOptions.disableExport !== this.initDisableExport) {
      warnings.push(
        'Export availability applies on first load. Reload the page to change it.'
      )
    }
    return warnings
  }

  /**
   * Creates the singleton `AcApDocManager` and registers commands, plugins, and listeners.
   *
   * Dynamically imports `@mlightcad/cad-simple-viewer` (reusing any background preload)
   * before calling `createInstance`.
   *
   * Configuration highlights:
   * - LibreDWG DWG converter — host-registered via {@link registerLibreDwgConverter} (GPL opt-in)
   * - `webworkerFileUrls` — MTEXT + LibreDWG worker (+ wasm) copied to `dist/assets/`
   * - `checkWorkersOnInit` — probe worker URLs after registration (see {@link WEBWORKER_FILE_URLS})
   * - `baseUrl` — optional CDN root for built-in resources (demo override)
   * - `useMainThreadDraw` — MTEXT render mode; fixed for the lifetime of the page session
   * - `disableExport` — hides built-in export commands; fixed for the page session
   *
   * HTML export runtime (`viewer-runtime.iife.js`) is configured on the HTML plugin via
   * {@link registerPlugins} / `registerLazyHtmlPlugin({ viewerRuntimeUrl })` — not here.
   *
   * Before `createInstance`, {@link AcApDocManager.checkWebworkerReadiness} verifies
   * that worker scripts respond without downloading large bundles (HEAD + ranged GET fallback).
   * DXF parsing uses the built-in converter in `@mlightcad/data-model` and needs no worker file.
   *
   * Idempotent: subsequent calls are no-ops once {@link CadViewerApp.isInitialized} is true.
   *
   * @param useMainThreadDraw - When `true`, MTEXT is rendered on the main thread instead of a worker
   * @param disableExport - When `true`, hide export commands and skip HTML/SVG plugins
   * @returns `true` when the viewer is ready; `false` when worker checks or init failed
   * @remarks On failure, logs to the console and shows an error toast via {@link CadViewerApp.showMessage}.
   */
  private async initialize(
    useMainThreadDraw: boolean,
    disableExport: boolean
  ): Promise<boolean> {
    if (this.isInitialized) {
      return true
    }

    try {
      // Prefer the shared preload promise so first open awaits in-flight work
      await preloadViewerAppModules(this.enablePlugins)
      const { AcApDocManager, AcEdCommandStack, acedApplyUiTheme } =
        await loadCadSimpleViewer()
      this.DocManager = AcApDocManager

      acedApplyUiTheme('dark', this.viewerPane)

      // Dynamic import keeps LibreDWG / data-model out of the app entry until first open.
      const { registerLibreDwgConverter } = await import('./registerLibreDwg')
      registerLibreDwgConverter(String(WEBWORKER_FILE_URLS.dwgParser))

      const workersReachable = await AcApDocManager.checkWebworkerReadiness(
        WEBWORKER_FILE_URLS
      )
      if (!workersReachable) {
        console.error(
          'CAD worker scripts are missing or blocked:',
          WEBWORKER_FILE_URLS
        )
        this.showMessage(
          'CAD worker scripts are missing. Ensure DWG/MTEXT workers are deployed to assets/.',
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
        disableExport
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

      const { initializeLocale } = await import('./i8n')
      initializeLocale()
      await this.registerCommands(AcEdCommandStack)

      if (this.enablePlugins) {
        // Dynamic import keeps plugin `/register` stubs out of the bare-viewer entry
        const { registerPlugins } = await import('./register')
        await registerPlugins(this.viewerPane)
      }

      docManager.events.documentActivated.addEventListener(args => {
        document.title = args.doc.docTitle
        if (this.hasOpenedFile) {
          this.showReopenButton()
        }
      })

      this.isInitialized = true
      this.initUseMainThreadDraw = useMainThreadDraw
      this.initDisableExport = disableExport
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
   * @param AcEdCommandStack - Command stack class from the loaded viewer module
   * @remarks Must run after {@link CadViewerApp.initialize} so `commandManager` exists.
   */
  private async registerCommands(
    AcEdCommandStack: (typeof import('@mlightcad/cad-simple-viewer'))['AcEdCommandStack']
  ): Promise<void> {
    const { AcApEllipseCmd } = await import('./ellipseCmd')
    const register = this.requireDocManager().instance.commandManager
    register.addCommand(
      AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
      'ellipsedemo',
      'ellipsedemo',
      new AcApEllipseCmd()
    )
  }

  /**
   * Returns the cached `AcApDocManager` class after successful initialization.
   */
  private requireDocManager(): typeof AcApDocManager {
    if (!this.DocManager) {
      throw new Error('CAD viewer is not initialized')
    }
    return this.DocManager
  }

  /**
   * Mounts {@link AcUiFileOpenPanel} into `#fileOpenHost` (same component used by
   * cad-viewer-example's landing panel).
   *
   * Loads `@mlightcad/cad-simple-viewer` dynamically so the entry stays free of a
   * static viewer import. Local file, URL, and new-drawing actions reuse the
   * existing open-option pills on the right.
   */
  private async mountFileOpenPanel(): Promise<void> {
    if (this.fileOpenPanel) {
      return
    }

    try {
      const { AcUiFileOpenPanel } = await loadCadSimpleViewer()
      this.fileOpenPanel = new AcUiFileOpenPanel({
        host: this.fileOpenHost,
        theme: 'light',
        showNewDrawing: true,
        getSources: () => [],
        onLocalFile: file => {
          void this.loadFile(file)
        },
        onUrl: url => {
          void this.loadUrl(url)
        },
        onNewDrawing: () => {
          void this.createNewDrawing()
        }
      })
    } catch (error) {
      console.error('Failed to mount file open panel:', error)
      this.showMessage('Failed to load open panel', 'error')
    }
  }

  /**
   * Collapses open options on narrow viewports (≤768px), matching cad-viewer-example.
   *
   * Desktop always keeps the options visible; only mobile can toggle via the header.
   */
  private setupSettingsCollapse(): void {
    this.mobileMediaQuery = window.matchMedia(MOBILE_MAX_WIDTH)
    this.syncMobileLayout()
    this.mobileMediaQuery.addEventListener('change', () => {
      this.syncMobileLayout()
    })

    this.settingsHeader.addEventListener('click', () => {
      if (!this.isMobileLayout) {
        return
      }
      this.settingsExpanded = !this.settingsExpanded
      this.syncSettingsExpanded()
    })
  }

  /**
   * Syncs {@link CadViewerApp.isMobileLayout} from the media query and resets
   * expansion when crossing the mobile/desktop breakpoint.
   */
  private syncMobileLayout(): void {
    const matches = this.mobileMediaQuery?.matches ?? false
    const wasMobile = this.isMobileLayout
    this.isMobileLayout = matches
    if (matches && !wasMobile) {
      this.settingsExpanded = false
    } else if (!matches) {
      this.settingsExpanded = true
    }
    this.syncSettingsExpanded()
  }

  /**
   * Applies expanded/collapsed state to the settings section DOM.
   *
   * On desktop the options are always shown even if {@link CadViewerApp.settingsExpanded}
   * is false.
   */
  private syncSettingsExpanded(): void {
    const expanded = !this.isMobileLayout || this.settingsExpanded
    this.settingsSection.classList.toggle('is-expanded', expanded)
    this.settingsHeader.setAttribute('aria-expanded', String(expanded))
    this.settingsPanel.hidden = !expanded
  }

  /**
   * Runs the built-in **OPEN** command when the corner **Open** button is clicked.
   */
  private setupReopenHandling(): void {
    this.reopenButton.addEventListener('click', () => {
      if (!this.isInitialized) {
        return
      }
      this.requireDocManager().instance.sendStringToExecute('open')
    })
  }

  /**
   * Initializes the viewer (if needed) and creates a blank document with the
   * current upload-screen open options.
   */
  private async createNewDrawing(): Promise<void> {
    const openOptions = this.readOpenOptions()
    const sessionWarnings = this.getSessionOptionWarnings(openOptions)

    if (
      !(await this.initialize(
        openOptions.useMainThreadDraw,
        openOptions.disableExport
      ))
    ) {
      return
    }

    this.clearMessages()

    try {
      const { layoutBackgroundColorFromRgb } = await loadCadSimpleViewer()
      const options = this.buildDatabaseOpenOptions(
        openOptions,
        layoutBackgroundColorFromRgb
      )

      const success = await this.requireDocManager().instance.newDocument(options)

      if (success) {
        this.hideUploadScreen()
        const base = 'New drawing created'
        this.showMessage(
          sessionWarnings.length > 0
            ? `${base}. ${sessionWarnings.join(' ')}`
            : base,
          sessionWarnings.length > 0 ? 'info' : 'success'
        )
      } else {
        this.showUploadScreen()
        this.showMessage('Failed to create new drawing', 'error')
      }
    } catch (error) {
      console.error('Error creating new drawing:', error)
      this.showUploadScreen()
      this.showMessage(`Error creating new drawing: ${error}`, 'error')
    }
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
   * @param file - User-selected file from {@link AcUiFileOpenPanel}
   */
  private async loadFile(file: File): Promise<void> {
    const openOptions = this.readOpenOptions()
    const sessionWarnings = this.getSessionOptionWarnings(openOptions)

    if (
      !(await this.initialize(
        openOptions.useMainThreadDraw,
        openOptions.disableExport
      ))
    ) {
      return
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.dxf') && !fileName.endsWith('.dwg')) {
      this.showMessage('Please select a DXF or DWG file', 'error')
      return
    }

    this.clearMessages()

    try {
      const docManager = this.requireDocManager().instance
      if (!(await docManager.areWorkersReady())) {
        this.showMessage(
          'CAD worker scripts are not reachable. Check deployment of assets/*-worker.js.',
          'error'
        )
        return
      }

      const fileContent = await this.readFile(file)
      const { layoutBackgroundColorFromRgb } = await loadCadSimpleViewer()
      const options = this.buildDatabaseOpenOptions(
        openOptions,
        layoutBackgroundColorFromRgb,
        { minimumChunkSize: 1000 }
      )

      const success = await docManager.openDocument(
        file.name,
        fileContent,
        options
      )

      if (success) {
        this.hideUploadScreen()
        const base = `Successfully loaded: ${file.name}`
        this.showMessage(
          sessionWarnings.length > 0
            ? `${base}. ${sessionWarnings.join(' ')}`
            : base,
          sessionWarnings.length > 0 ? 'info' : 'success'
        )
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
   * Opens a drawing from a remote URL chosen in {@link AcUiFileOpenPanel}.
   *
   * @param url - Absolute or same-origin URL to a `.dxf` / `.dwg` file
   */
  private async loadUrl(url: string): Promise<void> {
    const trimmed = url.trim()
    if (!trimmed) {
      this.showMessage('Please enter a URL', 'error')
      return
    }

    const openOptions = this.readOpenOptions()
    const sessionWarnings = this.getSessionOptionWarnings(openOptions)

    if (
      !(await this.initialize(
        openOptions.useMainThreadDraw,
        openOptions.disableExport
      ))
    ) {
      return
    }

    this.clearMessages()

    try {
      const docManager = this.requireDocManager().instance
      if (!(await docManager.areWorkersReady())) {
        this.showMessage(
          'CAD worker scripts are not reachable. Check deployment of assets/*-worker.js.',
          'error'
        )
        return
      }

      const { layoutBackgroundColorFromRgb } = await loadCadSimpleViewer()
      const options = this.buildDatabaseOpenOptions(
        openOptions,
        layoutBackgroundColorFromRgb,
        { minimumChunkSize: 1000 }
      )

      const success = await docManager.openUrl(trimmed, options)

      if (success) {
        this.hideUploadScreen()
        const base = `Successfully loaded: ${trimmed}`
        this.showMessage(
          sessionWarnings.length > 0
            ? `${base}. ${sessionWarnings.join(' ')}`
            : base,
          sessionWarnings.length > 0 ? 'info' : 'success'
        )
      } else {
        this.showUploadScreen()
        this.showMessage(`Failed to load: ${trimmed}`, 'error')
      }
    } catch (error) {
      console.error('Error loading URL:', error)
      this.showUploadScreen()
      this.showMessage(`Error loading URL: ${error}`, 'error')
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
 * Starts {@link CadViewerApp} once the DOM is ready.
 *
 * @param options - Passed to {@link CadViewerApp}
 */
export function bootCadViewerApp(options: CadViewerAppOptions = {}): void {
  const start = () => {
    new CadViewerApp(options)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
}
