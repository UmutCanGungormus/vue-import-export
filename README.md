# @umutcangungormus/vue-import-export

Vue 3 + TypeScript UI components and a backend-agnostic contract layer for
importing and exporting tabular data (CSV/XLSX). It is the **frontend
counterpart** to the
[`umutcangungormus/laravel-import-export`](https://github.com/umutcangungormus/laravel-import-export)
Laravel package and consumes that backend's `v1/imports` API.

It ships a full import workflow — file upload, server-side header detection,
column→field mapping (with confidence scoring), progress tracking, failure
export, and reusable mapping templates — as drop-in components, plus the
low-level seams to bring your own HTTP client, i18n, and toast/notification
system.

## Install

```bash
npm i @umutcangungormus/vue-import-export
```

## Peer dependencies

This package declares the following peers (the consuming app installs them):

| Peer            | Version | Required | Notes                                          |
| --------------- | ------- | -------- | ---------------------------------------------- |
| `vue`           | `^3.5`  | yes      | Composition API + `<script setup>`.            |
| `pinia`         | `^3`    | yes      | The import store is a Pinia store.             |
| `@heroicons/vue`| `^2`    | yes      | Icons used inside the components.              |
| `vue-i18n`      | `^11`   | optional | Only if you wire `t` to it (see seams).        |

`axios` ships as a regular dependency (used by the default API client). You may
replace it entirely with a custom `ImportApiClient`.

### Tailwind CSS v4 (required for styling)

The components are styled with **Tailwind CSS v4** utility classes. The compiled
CSS classes only exist in your bundle if Tailwind scans this package's source.
Add the package path to your Tailwind content sources so the utilities are not
purged:

```css
/* app.css — Tailwind v4 uses @source */
@import "tailwindcss";
@source "../node_modules/@umutcangungormus/vue-import-export/dist/**/*.{js,mjs}";
```

> If you are on Tailwind v3, add the same glob to `content` in
> `tailwind.config.js` instead. Without this step the components render
> unstyled.

## Quickstart

Install the plugin once at app bootstrap. It wires the three injection seams
(API client, translate, notify) and registers the client for the Pinia store.

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  createImportExport,
  createAxiosImportClient,
} from '@umutcangungormus/vue-import-export'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())

app.use(
  createImportExport({
    // The batteries-included axios client targeting the Laravel backend.
    apiClient: createAxiosImportClient({
      baseURL: import.meta.env.VITE_API_URL, // e.g. https://api.example.com
      getToken: () => localStorage.getItem('token'),
      onUnauthorized: () => router.push('/login'),
    }),
    // Optional: bridge to your i18n. Defaults to a passthrough.
    t: (key, params) => i18n.global.t(key, params),
    // Optional: bridge to your toast system. Defaults to a no-op.
    notify: ({ type, message }) => toast[type](message),
  }),
)

app.mount('#app')
```

### Using the all-in-one `<ImportManager>`

`<ImportManager>` is the orchestrator: it renders the upload area, the sessions
table, pagination, and the column-mapping modal, and drives them through the
Pinia store. For most apps this single component is all you need.

```vue
<script setup lang="ts">
import { ImportManager } from '@umutcangungormus/vue-import-export'
import type { APIImport } from '@umutcangungormus/vue-import-export'

const router = useRouter()
function onUploaded(session: APIImport) {
  console.log('new import session', session.id)
}
</script>

<template>
  <ImportManager
    title="Data Import"
    initial-model="App\\Models\\User"
    default-export-model="App\\Models\\User"
    @uploaded="onUploaded"
    @navigate="({ route }) => router.push(route)"
    @error="(message) => console.error(message)"
  />
</template>
```

### Using the individual components

Every building block is also exported so you can compose your own layout:

```ts
import {
  UploadInput,
  FileItem,
  ImportPagination,
  ColumnMappingModal,
  LogoUploadInput,
  useImportStore,
} from '@umutcangungormus/vue-import-export'
```

The Pinia store (`useImportStore`) exposes the import sessions, the active
mapping session, and async actions that call the injected `ImportApiClient`.

## Injection seams

The library never reaches into your app for HTTP, i18n, or toasts. Everything
flows through three seams you provide via the plugin (each has a safe default):

- **`apiClient`** — an `ImportApiClient`. Use `createAxiosImportClient(...)`
  for the default, or pass any object implementing the interface (e.g. a
  `fetch`-based or mock client) to fully decouple from axios. **Required.**
- **`t`** — a `TranslateFn`: `(key, params?) => string`. Defaults to a
  passthrough that returns `params.default` if present, else the key.
- **`notify`** — a `NotifyFn`: `({ type, message }) => void` where `type` is
  `'success' | 'error' | 'info' | 'warning'`. Defaults to a no-op.

You can also consume the seams directly inside your own components via the
composables `useImportApi()`, `useTranslate()`, and `useNotify()`, or provide
them manually with the exported injection keys `IMPORT_API_KEY`,
`TRANSLATE_KEY`, `NOTIFY_KEY`.

### `createAxiosImportClient(options)`

| Option            | Type                                     | Description                                                       |
| ----------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `baseURL`         | `string`                                 | Backend base URL.                                                 |
| `getToken`        | `() => string \| null \| undefined`      | Returns the bearer token (called per request).                    |
| `getLanguage`     | `() => string \| null \| undefined`      | Returns the `Accept-Language` tag (called per request).           |
| `withCredentials` | `boolean`                                | Send cookies. Defaults to `false`.                                |
| `headers`         | `Record<string, string>`                 | Extra default headers.                                            |
| `onUnauthorized`  | `(error: AxiosError) => void`            | Invoked on HTTP 401 (wire your login redirect here).              |
| `onError`         | `(error: AxiosError) => void`            | Invoked on any error response (wire your observability here).     |
| `axiosInstance`   | `AxiosInstance`                          | Supply a preconfigured instance; interceptors are still applied.  |

## Components

### `<ImportManager>`

The orchestrator. Renders upload + sessions table + pagination + mapping modal.

**Props**

| Prop                 | Type                  | Default            | Description                                              |
| -------------------- | --------------------- | ------------------ | -------------------------------------------------------- |
| `title`              | `string`              | `''`               | Title rendered in the header strip.                      |
| `parents`            | `NavigationParent[]`  | `[]`               | Breadcrumb parents (`{ label, route }`).                 |
| `initialModel`       | `string`              | `''`               | Pre-selected module/model in the filter + upload.        |
| `initialStatus`      | `string`              | `''`               | Pre-set status filter.                                   |
| `initialSearch`      | `string`              | `''`               | Pre-set free-text search.                                |
| `autoFetch`          | `boolean`             | `true`             | Fetch data on mount.                                     |
| `defaultExportModel` | `string`              | `'App\\Models\\User'` | Model used for "Export all" when no filter is set.    |

**Events**

| Event      | Payload                     | When                                                  |
| ---------- | --------------------------- | ----------------------------------------------------- |
| `navigate` | `{ route: string }`         | Host should navigate (breadcrumb/back).               |
| `uploaded` | `session: APIImport`        | A file uploaded and a session was created.            |
| `deleted`  | `id: number`                | An import session was deleted.                        |
| `started`  | `id: number`                | An import session began processing.                   |
| `error`    | `message: string`           | A recoverable error surfaced (also shown via notify). |

### `<UploadInput>`

Drag-and-drop / click file picker with progress and preview.

**Props:** `title?: string`, `formatInfo?: string`, `accept?: string`,
`modelValue?: UploadValue`, `instantUpload?: boolean`, `height?: string`.

**Events:** `update:modelValue (UploadValue)`, `change (UploadValue)`,
`progress (number)`. **Exposes:** `resetUpload()`.

`UploadValue` is `File | string | { url?, file?, name?, size?, type? } | null`.

### `<FileItem>`

A single import-session table row (file badge, module + status labels, date,
download-failures / delete actions).

**Props:** `item: APIImport`, `moduleLabel: string`, `statusLabel: string`,
`customClass?: string`. **Events:** `download (APIImport)`,
`delete (APIImport)`. **Slot:** `badge` (`{ item }`).

### `<ImportPagination>`

Page navigation + per-page selector.

**Props:** `currentPage: number`, `totalPages: number`, `perPage: number`,
`totalItems: number`. **Events:** `update:currentPage (number)`,
`update:perPage (number)`. **Slot:** `actions`.

### `<ColumnMappingModal>`

Modal for confirming the detected column→field mappings before starting an
import.

**Props:** `show: boolean`, `importId: number | null`,
`mappings: APIImportMapping[]`, `detectedHeaders: string[]`, `loading?: boolean`.
**Events:** `close ()`, `start (Record<string, string>)`.

### `<LogoUploadInput>`

A specialized single-image upload variant used for logos/avatars.

## Backend

This package is the frontend client for the Laravel package
[`umutcangungormus/laravel-import-export`](https://github.com/umutcangungormus/laravel-import-export),
which exposes the `v1/imports` API (initialize import, detect headers, suggest
and confirm mappings, run the import, summarize/export failures, and manage
reusable mapping templates). Install and configure that package on the server,
then point `createAxiosImportClient({ baseURL })` at it.

## Scripts

- `npm run build` — type build (`vue-tsc -b`) then `vite build` (ES + CJS → `dist`).
- `npm run dev` — Vite dev server.
- `npm test` — Vitest.
- `npm run typecheck` — `vue-tsc --noEmit`.
- `npm run lint` — ESLint.

## License

MIT © Umut Can Gungormus
