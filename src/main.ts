import { AcApDocManager, registerWorkers } from '@mlightcad/cad-simple-viewer'
import { AcDbOpenDatabaseOptions, AcGeBox2d } from '@mlightcad/data-model'
import { DocCreator } from './docCreator'

class CadViewerApp {
  private canvas: HTMLCanvasElement
  private fileInput: HTMLInputElement
  private newDrawingButton: HTMLButtonElement
  private loadingElement: HTMLElement

  constructor() {
    // Get DOM elements
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement
    this.fileInput = document.getElementById(
      'fileInputElement'
    ) as HTMLInputElement
    this.newDrawingButton = document.getElementById('newDrawingButton') as HTMLButtonElement
    this.loadingElement = document.getElementById('loading') as HTMLElement

    registerWorkers()
    this.initializeViewer()
    this.setupFileHandling()
    this.setupNewDrawingHandling()
  }

  private async initializeViewer() {
    try {
      // Initialize the document manager with the canvas
      AcApDocManager.createInstance(this.canvas)
    } catch (error) {
      console.error('Failed to initialize CAD viewer:', error)
      this.showMessage('Failed to initialize CAD viewer', 'error')
    }
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

  private setupNewDrawingHandling() {
    // New drawing button click event
    this.newDrawingButton.addEventListener('click', () => {
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
        docManager.setLayoutInfo()
        docManager.curView.zoomTo(new AcGeBox2d(
          { x: 8200, y: 85000 },
          { x: 11600, y: 86600 }
        ))
        
        // Hide the new drawing button after creating the drawing
        this.newDrawingButton.style.display = 'none'
        // Also hide the associated label
        const newButtonLabel = this.newDrawingButton.parentElement?.querySelector('.file-fab-label')
        if (newButtonLabel) {
          (newButtonLabel as HTMLElement).style.display = 'none'
        }
      }
    })
  }

  private async loadFile(file: File) {
    if (!AcApDocManager.instance) {
      this.showMessage('CAD viewer not initialized', 'error')
      return
    }

    // Validate file type
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.dxf') && !fileName.endsWith('.dwg')) {
      this.showMessage('Please select a DXF or DWG file', 'error')
      return
    }

    this.showLoading(true)
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
    } finally {
      this.showLoading(false)
    }
  }

  private readFile(file: File): Promise<string | ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string | ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      const fileName = file.name.toLowerCase()
      if (fileName.endsWith('.dxf')) {
        reader.readAsText(file)
      } else if (fileName.endsWith('.dwg')) {
        reader.readAsArrayBuffer(file)
      } else {
        reject(new Error('Unsupported file type'))
      }
    })
  }

  private showLoading(show: boolean) {
    this.loadingElement.style.display = show ? 'block' : 'none'
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
