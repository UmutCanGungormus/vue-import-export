# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-18

Initial public release.

### Added

- **Contract layer** decoupling the package from any host app:
  - `ImportApiClient` interface and the `createAxiosImportClient()` default
    implementation (`baseURL`, `getToken`, `getLanguage`, `withCredentials`,
    `headers`, `onUnauthorized`, `onError`, `axiosInstance`).
  - Injection keys (`IMPORT_API_KEY`, `TRANSLATE_KEY`, `NOTIFY_KEY`) and the
    composables `useImportApi()`, `useTranslate()`, `useNotify()` with safe
    defaults (passthrough translate, no-op notify).
- **`createImportExport()` Vue plugin** that provides the seams and registers
  the API client for the Pinia store.
- **Components:** `ImportManager` (orchestrator), `UploadInput`,
  `LogoUploadInput`, `FileItem`, `ImportPagination`, `ColumnMappingModal`.
- **Pinia store** `useImportStore` driving the import workflow.
- **Domain types** mirroring the `umutcangungormus/laravel-import-export`
  backend's `v1/imports` API (`APIImport`, `APIImportMapping`,
  `APIImportTemplate`, payloads, etc.).
- ES + CJS builds with bundled TypeScript declarations.

[0.1.0]: https://github.com/umutcangungormus/vue-import-export/releases/tag/v0.1.0
