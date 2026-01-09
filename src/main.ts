import { AcApDocManager, AcEdCommandStack } from '@mlightcad/cad-simple-viewer'
import { AcDbOpenDatabaseOptions } from '@mlightcad/data-model'
import { DocCreator } from './docCreator'
import { AcApEllipseCmd } from './ellipseCmd'
import { initializeLocale } from './i8n'

class CadViewerApp {
  private container: HTMLDivElement
  private fileInput: HTMLInputElement
  private newDrawingButton: HTMLButtonElement
  private isInitialized: boolean = false

  constructor() {
    // Get DOM elements
    this.container = document.getElementById('cad-container') as HTMLDivElement
    this.fileInput = document.getElementById('fileInputElement') as HTMLInputElement
    this.newDrawingButton = document.getElementById('newDrawingButton') as HTMLButtonElement

    this.setupFileHandling()
    this.setupNewDrawingHandling()
  }

  private initialize() {
    if (!this.isInitialized) {
      try {
        // Initialize the document manager with the canvas and baseUrl.
        // Actually 'baseUrl' here isn't required. Override default 'baseUrl'
        // value is just for demostration.
        AcApDocManager.createInstance({
          container: this.container,
          autoResize: true,
          baseUrl: 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/'
        })
        initializeLocale()
        this.registerCommands()
        this.isInitialized = true
      } catch (error) {
        console.error('Failed to initialize CAD viewer:', error)
        this.showMessage('Failed to initialize CAD viewer', 'error')
      }
    }
  }

  private registerCommands() {
    const register = AcApDocManager.instance.commandManager
    register.addCommand(
      AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
      'ellipse',
      'ellipse',
      new AcApEllipseCmd()
    )
  }

  private setupFileHandling() {
    // File input change event
    this.fileInput.addEventListener('change', event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (file) {
        this.loadFile(file)
      }
      this.fileInput.value = ''
    })
  }

  private hideNewButton() {
    // Hide the new drawing button after creating the drawing
    this.newDrawingButton.style.display = 'none'
    // Also hide the associated label
    const newButtonLabel = this.newDrawingButton.parentElement?.querySelector('.file-fab-label')
    if (newButtonLabel) {
      (newButtonLabel as HTMLElement).style.display = 'none'
    }
  }

  private setupNewDrawingHandling() {
    // New drawing button click event
    this.newDrawingButton.addEventListener('click', () => {
      this.initialize()
      const docManager = AcApDocManager.instance
      if (!docManager) {
        this.showMessage('CAD viewer not initialized', 'error')
        return
      }
      const doc = docManager.curDocument
      if (doc) {
        // Add loaded class to move file input container to top-left
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

  private async loadFile(file: File) {
    this.initialize()

    // Validate file type
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.dxf') && !fileName.endsWith('.dwg')) {
      this.showMessage('Please select a DXF or DWG file', 'error')
      return
    }

    this.hideNewButton()
    this.clearMessages()

    try {
      // Read the file content
      const fileContent = await this.readFile(file)

      // Add loaded class to move file input container to top-left
      const fileInputContainer = document.getElementById('fileInputContainer')
      if (fileInputContainer) {
        fileInputContainer.classList.add('loaded')
      }

      // Set database options
      const options: AcDbOpenDatabaseOptions = {
        minimumChunkSize: 1000,
        readOnly: true
      }

      // Open the document
      const success = await AcApDocManager.instance.openDocument(
        file.name,
        fileContent,
        options
      )

      if (success) {
        this.showMessage(`Successfully loaded: ${file.name}`, 'success')
      } else {
        this.showMessage(`Failed to load: ${file.name}`, 'error')
      }
    } catch (error) {
      console.error('Error loading file:', error)
      this.showMessage(`Error loading file: ${error}`, 'error')
    }
  }

  private readFile(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(file)
    })
  }

  private showMessage(
    message: string,
    type: 'success' | 'error' | 'info' = 'info'
  ) {
    // Remove old persistent messages
    this.clearMessages()

    // Create popup message element
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

  private clearMessages() {
    // Remove all popup messages
    document.querySelectorAll('.popup-message').forEach(el => el.remove())
  }
}

// Also initialize immediately if DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new CadViewerApp()
  })
} else {
  new CadViewerApp()
}
