/**
 * Decoupling layer: injection contracts + composables.
 *
 * The library never reaches into the host app for i18n, toasts, or an HTTP
 * client. Instead it declares injection keys here; the host provides them via
 * the plugin ({@link ./plugin}). Each composable reads its dependency through
 * `inject` and falls back to a safe default so components remain usable even
 * when the plugin is not installed (e.g. in isolated unit tests / Storybook).
 */
import { inject, type InjectionKey } from 'vue'
import type { ImportApiClient } from './api/ImportApiClient.js'
import type { NotifyPayload } from './types.js'

// --- Contract types ---

/**
 * Translation function. `key` is a message id; `params` are interpolation
 * values. Implementations (e.g. vue-i18n's `t`) should return the resolved
 * string. The default passthrough returns `params.default` if present,
 * otherwise the key itself.
 */
export type TranslateFn = (
  key: string,
  params?: Record<string, unknown> & { default?: string },
) => string

/** Toast/notification callback. */
export type NotifyFn = (payload: NotifyPayload) => void

// --- Injection keys ---

export const IMPORT_API_KEY: InjectionKey<ImportApiClient> = Symbol(
  'vue-import-export:apiClient',
)
export const TRANSLATE_KEY: InjectionKey<TranslateFn> = Symbol(
  'vue-import-export:translate',
)
export const NOTIFY_KEY: InjectionKey<NotifyFn> = Symbol(
  'vue-import-export:notify',
)

// --- Safe defaults ---

/** Passthrough translator: returns `params.default` or the raw key. */
export const defaultTranslate: TranslateFn = (key, params) =>
  (params?.default as string | undefined) ?? key

/** No-op notifier. */
export const defaultNotify: NotifyFn = () => {}

// --- Composables ---

/**
 * Resolve the {@link ImportApiClient}. Throws if no client was provided, since
 * there is no meaningful default for network access — the plugin must supply
 * one (the {@link createImportExport} plugin enforces this).
 */
export function useImportApi(): ImportApiClient {
  const client = inject(IMPORT_API_KEY, null)
  if (!client) {
    throw new Error(
      '[vue-import-export] No ImportApiClient provided. Install the plugin via ' +
        'app.use(createImportExport({ apiClient })) or provide IMPORT_API_KEY.',
    )
  }
  return client
}

/** Resolve the translate function, defaulting to a passthrough. */
export function useTranslate(): TranslateFn {
  return inject(TRANSLATE_KEY, defaultTranslate)
}

/** Resolve the notify function, defaulting to a no-op. */
export function useNotify(): NotifyFn {
  return inject(NOTIFY_KEY, defaultNotify)
}
