import { bootCadViewerApp } from './app'

/**
 * Bare viewer demo: creates `AcApDocManager` without registering any plugins
 * (no simple UI toolbar, no HTML/PDF/SVG export plugins).
 */
bootCadViewerApp({ enablePlugins: false })
