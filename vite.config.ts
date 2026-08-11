import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type PluginOption } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { viteStaticCopy } from 'vite-plugin-static-copy'

/**
 * Split heavy peer deps into their own chunks so `cad-simple-viewer-*.js` stays
 * smaller and each package can be cached independently.
 *
 * Keep `data-model` with `geometry-engine` / `graphic-interface` / `common`
 * (tight class hierarchy). Keep `mtext-*` / `shx-parser` with `three-renderer`
 * so they are not absorbed into `cad-simple-viewer` and create a circular chunk
 * edge. `three` includes `three/examples/jsm/*`.
 */
function viewerManualChunk(id: string): string | undefined {
  const path = id.replace(/\\/g, '/')
  if (
    path.includes('/node_modules/three/') ||
    path.includes('/node_modules/.pnpm/three@')
  ) {
    return 'three'
  }
  if (
    path.includes('/@mlightcad/three-renderer/') ||
    path.includes('/@mlightcad/mtext-renderer/') ||
    path.includes('/@mlightcad/mtext-parser/') ||
    path.includes('/@mlightcad/shx-parser/')
  ) {
    return 'three-renderer'
  }
  if (
    path.includes('/@mlightcad/data-model/') ||
    path.includes('/@mlightcad/geometry-engine/') ||
    path.includes('/@mlightcad/graphic-interface/') ||
    path.includes('/@mlightcad/common/')
  ) {
    return 'data-model'
  }
  if (path.includes('/@mlightcad/cad-simple-viewer/')) {
    return 'cad-simple-viewer'
  }
}

const viewerRuntimeSrc = resolve(
  __dirname,
  'node_modules/@mlightcad/cad-html-plugin/dist/viewer-runtime.iife.js'
)
const hasViewerRuntime = existsSync(viewerRuntimeSrc)

if (!hasViewerRuntime) {
  console.warn(
    '[cad-simple-viewer-example] viewer-runtime.iife.js not found — HTML export (chtml) unavailable. ' +
      'Opening DXF/DWG does not require @mlightcad/cad-html-plugin.'
  )
}

export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    modulePreload: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'no-plugin': resolve(__dirname, 'no-plugin.html')
      },
      output: {
        manualChunks: viewerManualChunk
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: './node_modules/@mlightcad/cad-simple-viewer/dist/*-worker.js',
          dest: 'assets'
        },
        ...(hasViewerRuntime
          ? [
              {
                src: './node_modules/@mlightcad/cad-html-plugin/dist/viewer-runtime.iife.js',
                dest: 'assets'
              }
            ]
          : [])
      ]
    }),
    mode === 'analyze' &&
      visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true })
  ].filter(Boolean) as PluginOption[]
}))
