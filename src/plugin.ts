/**
 * Vue plugin that wires the decoupling contracts into an app.
 *
 * Usage:
 * ```ts
 * import { createApp } from 'vue'
 * import { createImportExport, createAxiosImportClient } from '@umutcangungormus/vue-import-export'
 *
 * app.use(createImportExport({
 *   apiClient: createAxiosImportClient({ baseURL: '/api', getToken: () => token }),
 *   t: (key, params) => i18n.global.t(key, params),
 *   notify: ({ type, message }) => toast[type](message),
 * }))
 * ```
 *
 * The client is also stashed on `app.config.globalProperties` so a Pinia store
 * action can resolve it outside of a component `setup()` (where `inject` is
 * unavailable) via {@link resolveImportApi}.
 */
import type { App, Plugin } from 'vue'
import type { ImportApiClient } from './api/ImportApiClient.js'
import {
  IMPORT_API_KEY,
  TRANSLATE_KEY,
  NOTIFY_KEY,
  defaultTranslate,
  defaultNotify,
  type TranslateFn,
  type NotifyFn,
} from './adapters.js'

export interface CreateImportExportOptions {
  /** Backend client. Required. Use createAxiosImportClient() for the default. */
  apiClient: ImportApiClient
  /** Translation function. Defaults to a passthrough. */
  t?: TranslateFn
  /** Toast/notification callback. Defaults to a no-op. */
  notify?: NotifyFn
}

/**
 * Internal registry so the Pinia store can reach the active client without an
 * injection context. Keyed by Vue app instance to stay multi-app safe.
 */
const registry = new WeakMap<App, ImportApiClient>()
let lastInstalledClient: ImportApiClient | null = null

export function createImportExport(options: CreateImportExportOptions): Plugin {
  if (!options?.apiClient) {
    throw new Error(
      '[vue-import-export] createImportExport requires an `apiClient`.',
    )
  }
  const t = options.t ?? defaultTranslate
  const notify = options.notify ?? defaultNotify

  return {
    install(app: App) {
      app.provide(IMPORT_API_KEY, options.apiClient)
      app.provide(TRANSLATE_KEY, t)
      app.provide(NOTIFY_KEY, notify)

      app.config.globalProperties.$importApi = options.apiClient
      registry.set(app, options.apiClient)
      lastInstalledClient = options.apiClient
    },
  }
}

/**
 * Resolve the import API client outside of component `setup()` — used by the
 * Pinia store. Returns the most recently installed client. For multi-app
 * setups, pass the specific `App` instance.
 */
export function resolveImportApi(app?: App): ImportApiClient {
  const client = app ? registry.get(app) : lastInstalledClient
  if (!client) {
    throw new Error(
      '[vue-import-export] No ImportApiClient registered. Install the plugin ' +
        'via app.use(createImportExport({ apiClient })) before using the store.',
    )
  }
  return client
}
