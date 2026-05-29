# CAD Simple Viewer Example

This is an example application that demonstrates how to use the `@mlightcad/cad-simple-viewer` package to display DXF and DWG files in a web browser.

[**🌐 Live Demo**](https://mlightcad.github.io/cad-simple-viewer-example/)

## Features

- 📁 Open one DWG/DXF file
- ✏️ Create one drawing
- 📄 Export the current drawing as a self-contained HTML file (`chtml` command)

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Usage

### Basic Usage

Firstly, add the following dependencies into your `package.json`.

- @mlightcad/cad-simple-viewer
- @mlightcad/data-model

Secondly, add one contain element for cad-simple-viewer.

```html
<body>
  <div id="cad-container"></div>
</body>
```

Thirdly, initialize the viewer in your entry point:

```typescript
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { AcDbOpenDatabaseOptions } from '@mlightcad/data-model'

const container = document.getElementById('cad-container') as HTMLDivElement

AcApDocManager.createInstance({
  container,
  autoResize: true,
  webworkerFileUrls: {
    mtextRender: './assets/mtext-renderer-worker.js',
    dxfParser: './assets/dxf-parser-worker.js',
    dwgParser: './assets/libredwg-parser-worker.js'
  },
  htmlViewerRuntimeUrl: './assets/viewer-runtime.iife.js'
})

// Read the file content
const fileContent = await readFile(file)

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

// Your application logic here...
```

Finally, copy static assets to the `dist/assets` folder.

Web workers are used to parse DXF/DWG files and render MTEXT entities so the UI is not blocked. The HTML viewer runtime is required when exporting drawings to standalone HTML files. You can copy the following files to `dist/assets` manually:

- `./node_modules/@mlightcad/data-model/dist/dxf-parser-worker.js`
- `./node_modules/@mlightcad/cad-simple-viewer/dist/libredwg-parser-worker.js`
- `./node_modules/@mlightcad/cad-simple-viewer/dist/mtext-renderer-worker.js`
- `./node_modules/@mlightcad/cad-simple-viewer/dist/viewer-runtime.iife.js`

However, `vite-plugin-static-copy` is recommended to make your life easier.

```typescript
import { resolve } from 'path'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig(() => {
  return {
    base: './',
    build: {
      modulePreload: false,
      rollupOptions: {
        // Main entry point for the app
        input: {
          main: resolve(__dirname, 'index.html')
        }
      }
    },
    plugins: [
      viteStaticCopy({
        targets: [
          {
            src: './node_modules/@mlightcad/data-model/dist/dxf-parser-worker.js',
            dest: 'assets'
          },
          {
            src: './node_modules/@mlightcad/cad-simple-viewer/dist/*-worker.js',
            dest: 'assets'
          },
          {
            src: './node_modules/@mlightcad/cad-simple-viewer/dist/viewer-runtime.iife.js',
            dest: 'assets'
          }
        ]
      })
    ]
  }
})
```

### Export to HTML

`cad-simple-viewer` includes a built-in `chtml` command that exports the active drawing as a **self-contained HTML file**. The snapshot and viewer runtime are inlined into a single file, so the result can be opened directly in a browser (including via `file://`).

Trigger the export after a document is loaded:

```typescript
AcApDocManager.instance.sendStringToExecute('chtml')
```

For export to work, two things are required:

1. **Serve `viewer-runtime.iife.js`** — copy it to your static assets (see `vite.config.ts` above) and set `htmlViewerRuntimeUrl` when creating `AcApDocManager`. At export time the runtime is fetched and embedded into the HTML. If this file is missing, the dev server may return `index.html` instead, and the exported file will fail to open with `Unexpected token '<'`.
2. **Match URLs** — `htmlViewerRuntimeUrl` must point to the same path where the runtime file is served (for example `./assets/viewer-runtime.iife.js`).

### Beyond a Viewer

While `cad-simple-viewer` doesn't support saving drawings to DWG/DXF files, it provides comprehensive support for **modifying drawings in real-time**. You can add, edit, and delete entities within the drawing, and the viewer will automatically update to reflect these changes.

When you modify entities, you're working directly with the underlying drawing database. The viewer automatically detects these changes and updates the display accordingly. This real-time synchronization ensures that:

- All modifications are immediately visible
- The command stack properly tracks changes for undo/redo operations. This will be implemented soon.

This capability makes `cad-simple-viewer` suitable for applications that need to not only display CAD files but also allow users to interact with and modify the drawing content.

**Important Note**: The usage patterns in `cad-simple-viewer` are **very similar to AutoCAD RealDWG**. If you're familiar with AutoCAD RealDWG development, you'll find the API structure and workflow nearly identical. The main difference is that we use the [**realdwg-web API**](https://mlightcad.github.io/realdwg-web/) instead of the native RealDWG libraries.

#### Example: Adding Entities

The following code demonstrates how to add entities, following the same pattern you'd use in AutoCAD RealDWG:

```typescript
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { AcDbLine, AcDbCircle, AcDbText, AcGePoint3d, AcGeVector3d } from '@mlightcad/data-model'

// Get the current document (same as RealDWG)
const doc = AcApDocManager.instance.curDocument
if (!doc) return

// Get the model space (identical to RealDWG pattern)
const modelSpace = doc.database.modelSpace

// Add a line (same constructor and property setting as RealDWG)
const startPoint = new AcGePoint3d(0, 0, 0)
const endPoint = new AcGePoint3d(100, 100, 0)
const line = new AcDbLine(startPoint, endPoint)
line.layer = '0' // Set layer (same property name as RealDWG)
line.color = 1 // Red color (same color index as RealDWG)
modelSpace.appendEntity(line)

// Add a circle (identical API to RealDWG)
const centerPoint = new AcGePoint3d(50, 50, 0)
const radius = 25
const circle = new AcDbCircle(centerPoint, radius)
circle.layer = '0'
circle.color = 2 // Yellow color
modelSpace.appendEntity(circle)

// Add text (same constructor pattern as RealDWG)
const textPoint = new AcGePoint3d(0, -50, 0)
const text = new AcDbText(textPoint, 'Sample Text', 10) // position, text, height
text.layer = '0'
text.color = 3 // Green color
modelSpace.appendEntity(text)
```

Please refer to class [DocCreator](./src/docCreator.ts) to get one full example to create one new drawing.


#### Example: Custom Command

Commands are the primary way users interact with the CAD-Viewer. Each command represents a specific operation, such as drawing a line, creating a circle, zooming, or selecting objects. CAD-Viewer supports creating custom commands to extend functionalities of CAD-Viewer.

- [Wiki Page](https://github.com/mlightcad/cad-viewer/wiki/Command): Introduce how to create one custom command.
- [Example Code](./src/ellipseCmd.ts): One demo command to create one ellipse by center, major axis, and minor radius.

## License

[MIT](LICENSE)