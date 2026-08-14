/**
 * Default axios-backed {@link ImportApiClient} implementation.
 *
 * Mirrors how competo-fe `src/lib/sdk/http-client.ts` + `src/lib/sdk/import.ts`
 * build requests:
 *  - default headers `X-Requested-With: XMLHttpRequest` and
 *    `Content-Type: application/json`;
 *  - array query params serialized as `key[]=a&key[]=b`, with
 *    `undefined`/`null`/`''` values dropped;
 *  - a bearer token applied per-request via an interceptor;
 *  - `Content-Type` removed for `FormData` bodies so the browser sets its own
 *    multipart boundary (used by {@link ImportApiClient.initializeImport});
 *  - `responseType: 'blob'` for file downloads
 *    ({@link ImportApiClient.exportFailures} / {@link ImportApiClient.exportModel});
 *  - responses unwrapped from the Laravel `{ data, message, errors, meta }`
 *    envelope.
 *
 * The host app's `http-client.ts` also performed app-specific concerns —
 * `Accept-Language` from the active locale, 401 → login redirect, and Sentry
 * capture for 5xx/429. Those are NOT hardcoded here (they reach into the
 * router, `localStorage`, and Sentry). Instead they are exposed as optional,
 * decoupled seams: {@link CreateAxiosImportClientOptions.getLanguage},
 * {@link CreateAxiosImportClientOptions.onUnauthorized}, and
 * {@link CreateAxiosImportClientOptions.onError}. The host can wire these to
 * replicate its previous behavior.
 *
 * Consumers may instead pass their own {@link ImportApiClient} to the plugin.
 */
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from 'axios'
import type {
  ImportApiClient,
  RequestConfig,
  BlobResponse,
} from './ImportApiClient.js'
import type {
  APIResponse,
  APIImport,
  APIImportMapping,
  APIImportProgress,
  APIImportTemplate,
  APIFailureSummary,
  AllowedModel,
  ImportSessionMeta,
  MappingSuggestion,
  PaginationMeta,
  ImportListParams,
  UpdateMappingPayload,
  BatchUpdateMappingsPayload,
  CreateImportTemplatePayload,
  UpdateImportTemplatePayload,
  SaveTemplateFromSessionPayload,
} from '../types.js'

export interface CreateAxiosImportClientOptions {
  /** Base URL of the backend, e.g. `https://api.example.com`. */
  baseURL?: string
  /** Returns the current bearer token (called per request). */
  getToken?: () => string | null | undefined
  /** Send cookies with requests. Defaults to `false`. */
  withCredentials?: boolean
  /** Extra default headers merged onto every request. */
  headers?: Record<string, string>
  /**
   * Returns the language tag to send as the `Accept-Language` header (called
   * per request). Mirrors the host app's per-request locale header without
   * coupling this package to the host's router/`localStorage` locale logic.
   * The header is only set when this returns a non-empty string and the
   * request does not already carry an explicit `Accept-Language`.
   */
  getLanguage?: () => string | null | undefined
  /**
   * Invoked on any error response, after {@link onUnauthorized}. Receives the
   * raw axios error. Replaces the host app's hardcoded Sentry capture so the
   * consumer can wire their own observability. The error is still rejected to
   * the caller regardless.
   */
  onError?: (error: AxiosError) => void
  /**
   * Invoked when a request fails with HTTP 401. Replaces the host app's
   * hardcoded login redirect (which touched the router and `localStorage`).
   * Receives the raw axios error so the consumer can decide how to react.
   * The error is still rejected to the caller.
   */
  onUnauthorized?: (error: AxiosError) => void
  /**
   * Supply a fully pre-configured axios instance. When provided, `baseURL`,
   * `withCredentials` and `headers` are ignored (the instance owns config),
   * but `getToken`, `getLanguage`, `onUnauthorized` and `onError` are still
   * applied via interceptors.
   */
  axiosInstance?: AxiosInstance
}

function unwrap<T, M = PaginationMeta>(response: {
  data: any
  status: number
}): APIResponse<T, M> {
  const body = response.data
  return {
    data: body?.data ?? body,
    status: response.status,
    message: body?.message ?? '',
    errors: body?.errors,
    meta: body?.meta,
  }
}

function nullEnvelope(response: {
  data: any
  status: number
}): APIResponse<null> {
  return {
    data: null,
    status: response.status,
    message: response.data?.message ?? '',
    errors: response.data?.errors,
  }
}

/** Map our transport-agnostic RequestConfig onto AxiosRequestConfig. */
function toAxiosConfig(config?: RequestConfig): AxiosRequestConfig | undefined {
  if (!config) return undefined
  return {
    headers: config.headers,
    params: config.params,
    signal: config.signal,
    onUploadProgress: config.onUploadProgress
      ? (e) =>
          config.onUploadProgress!({
            loaded: e.loaded,
            total: e.total,
          })
      : undefined,
  }
}

export function createAxiosImportClient(
  options: CreateAxiosImportClientOptions = {},
): ImportApiClient {
  let authToken: string | null = null

  const client: AxiosInstance =
    options.axiosInstance ??
    axios.create({
      baseURL: options.baseURL,
      withCredentials: options.withCredentials ?? false,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
        ...options.headers,
      },
      // Serialize arrays as `key[]=a&key[]=b`, dropping empty values
      // (matches competo-fe http-client.ts).
      paramsSerializer: {
        serialize: (params: Record<string, unknown>) => {
          const search = new URLSearchParams()
          Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return
            if (Array.isArray(value)) {
              value.forEach((item) => search.append(`${key}[]`, String(item)))
            } else {
              search.append(key, String(value))
            }
          })
          return search.toString()
        },
      },
    })

  client.interceptors.request.use((config) => {
    // Bearer token (per-request, like the host's interceptor).
    const token = options.getToken?.() ?? authToken
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }

    // Accept-Language, only if the caller didn't set one explicitly.
    if (!config.headers.get('Accept-Language')) {
      const lang = options.getLanguage?.()
      if (lang) {
        config.headers.set('Accept-Language', lang)
      }
    }

    // Let the browser set the multipart boundary for FormData uploads;
    // otherwise ensure JSON (mirrors host http-client.ts).
    if (config.data instanceof FormData) {
      config.headers.delete('Content-Type')
    } else if (!config.headers.get('Content-Type')) {
      config.headers.set('Content-Type', 'application/json')
    }

    return config
  })

  if (options.onUnauthorized || options.onError) {
    client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          options.onUnauthorized?.(error)
        }
        options.onError?.(error)
        return Promise.reject(error)
      },
    )
  }

  async function blob(url: string): Promise<BlobResponse> {
    const res = await client.get(url, { responseType: 'blob' })
    return {
      data: res.data as Blob,
      status: res.status,
      headers: res.headers as Record<string, string>,
    }
  }

  return {
    setAuthToken(token: string | null) {
      authToken = token
    },

    // --- Allowed models ---

    async getAllowedModels(): Promise<APIResponse<AllowedModel[]>> {
      return unwrap<AllowedModel[]>(
        await client.get('/v1/imports/allowed-models'),
      )
    },

    // --- Import sessions ---

    async listImports(
      params?: ImportListParams,
    ): Promise<APIResponse<APIImport[]>> {
      return unwrap<APIImport[]>(await client.get('/v1/imports', { params }))
    },

    async initializeImport(
      formData: FormData,
      config?: RequestConfig,
    ): Promise<APIResponse<APIImport, ImportSessionMeta>> {
      return unwrap<APIImport, ImportSessionMeta>(
        await client.post(
          '/v1/imports/initialize',
          formData,
          toAxiosConfig(config),
        ),
      )
    },

    async getImport(id: number): Promise<APIResponse<APIImport, ImportSessionMeta>> {
      return unwrap<APIImport, ImportSessionMeta>(await client.get(`/v1/imports/${id}`))
    },

    async deleteImport(id: number): Promise<APIResponse<null>> {
      return nullEnvelope(await client.delete(`/v1/imports/${id}`))
    },

    async startImport(id: number): Promise<APIResponse<null>> {
      return nullEnvelope(await client.post(`/v1/imports/${id}/start`))
    },

    async cancelImport(id: number): Promise<APIResponse<null>> {
      return nullEnvelope(await client.post(`/v1/imports/${id}/cancel`))
    },

    async getProgress(id: number): Promise<APIResponse<APIImportProgress>> {
      return unwrap<APIImportProgress>(
        await client.get(`/v1/imports/${id}/progress`),
      )
    },

    // --- Mappings ---

    async listMappings(id: number): Promise<APIResponse<APIImportMapping[]>> {
      return unwrap<APIImportMapping[]>(
        await client.get(`/v1/imports/${id}/mappings`),
      )
    },

    async updateMapping(
      id: number,
      payload: UpdateMappingPayload,
    ): Promise<APIResponse<unknown>> {
      return unwrap<unknown>(
        await client.post(`/v1/imports/${id}/mappings`, payload),
      )
    },

    async updateMappingsBatch(
      id: number,
      payload: BatchUpdateMappingsPayload,
    ): Promise<APIResponse<unknown>> {
      return unwrap<unknown>(
        await client.post(`/v1/imports/${id}/mappings/batch`, payload),
      )
    },

    async mappingSuggestions(
      id: number,
    ): Promise<APIResponse<MappingSuggestion[]>> {
      return unwrap<MappingSuggestion[]>(
        await client.get(`/v1/imports/${id}/mappings/suggestions`),
      )
    },

    // --- Failures ---

    async failuresSummary(id: number): Promise<APIResponse<APIFailureSummary>> {
      return unwrap<APIFailureSummary>(
        await client.get(`/v1/imports/${id}/failures/summary`),
      )
    },

    async exportFailures(id: number): Promise<BlobResponse> {
      return blob(`/v1/imports/${id}/failures/export`)
    },

    // --- Export ---

    async exportModel(model: string): Promise<BlobResponse> {
      return blob(`/v1/exports/${model}`)
    },

    // --- Templates ---

    async listTemplates(): Promise<APIResponse<APIImportTemplate[]>> {
      return unwrap<APIImportTemplate[]>(
        await client.get('/v1/imports/templates'),
      )
    },

    async createTemplate(
      payload: CreateImportTemplatePayload,
    ): Promise<APIResponse<APIImportTemplate>> {
      return unwrap<APIImportTemplate>(
        await client.post('/v1/imports/templates', payload),
      )
    },

    async getTemplate(id: number): Promise<APIResponse<APIImportTemplate>> {
      return unwrap<APIImportTemplate>(
        await client.get(`/v1/imports/templates/${id}`),
      )
    },

    async updateTemplate(
      id: number,
      payload: UpdateImportTemplatePayload,
    ): Promise<APIResponse<APIImportTemplate>> {
      return unwrap<APIImportTemplate>(
        await client.put(`/v1/imports/templates/${id}`, payload),
      )
    },

    async deleteTemplate(id: number): Promise<APIResponse<null>> {
      return nullEnvelope(await client.delete(`/v1/imports/templates/${id}`))
    },

    async setDefaultTemplate(
      id: number,
    ): Promise<APIResponse<APIImportTemplate>> {
      return unwrap<APIImportTemplate>(
        await client.post(`/v1/imports/templates/${id}/set-default`),
      )
    },

    async saveTemplate(
      sessionId: number,
      payload: SaveTemplateFromSessionPayload,
    ): Promise<APIResponse<APIImportTemplate>> {
      return unwrap<APIImportTemplate>(
        await client.post(`/v1/imports/${sessionId}/save-template`, payload),
      )
    },

    async applyTemplate(
      sessionId: number,
      templateId: number,
    ): Promise<APIResponse<APIImport, ImportSessionMeta>> {
      return unwrap<APIImport, ImportSessionMeta>(
        await client.post(
          `/v1/imports/${sessionId}/apply-template/${templateId}`,
        ),
      )
    },
  }
}
