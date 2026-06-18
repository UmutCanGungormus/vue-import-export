/**
 * Pinia store exports.
 *
 * Exports `useImportStore`, which resolves its backend through the injected
 * {@link ImportApiClient} (via the {@link useImportApi} adapter) instead of an
 * app-specific SDK singleton. List/upload/mapping/progress-polling/template
 * state lives here.
 */
export { useImportStore } from './import.js'
