# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-08-14

### Added

- **Full-catalogue column mapping.** `<ColumnMappingModal>` takes a `fields`
  prop (`APIImportField[]`) describing every importable target field of the
  model, and lists all of them — not only the ones the uploaded file matched —
  so a field the file never mentions can be mapped by hand.
- Mapping editor UI for catalogues that run to hundreds of targets: field search
  (diacritic-folded, matching labels, keys and aliases), collapsible sections per
  repeating group with a per-section summary, a "mapped + required" ↔ "all
  fields" scope toggle, and a panel naming the file columns left unmapped.
- Picking a header another field already holds moves it, with a notice and an
  undo — a column can only feed one target, so two fields claiming one is not a
  state the backend can store.
- `useImportStore` gained `fieldCatalogue`, `fieldCatalogueLoading` and
  `fetchFieldCatalogue(id)`. The catalogue comes from the initialize response's
  `meta.fields`, falling back to `GET /v1/imports/{id}/mappings/suggestions`.
- New exported types: `APIImportField`, `ImportSessionMeta`,
  `MappingColumnUpdate`.

### Changed

- `ColumnMappingModal`'s `start` event gained a second argument: the column
  updates to persist. Argument 0 is unchanged, and `ImportManager` still derives
  a payload from it alone, so a host on the single-argument contract keeps
  working.
- Cleared mappings are now saved explicitly (`target_field: null`,
  `confirmed: false`). Previously only the mapped columns were sent, so clearing
  a column the backend had auto-confirmed left it importing.
- `APIResponse` takes a second, defaulted generic for its `meta`;
  `initializeImport`, `getImport` and `applyTemplate` return
  `APIResponse<APIImport, ImportSessionMeta>`.
- `UpdateMappingPayload` / `BatchUpdateMappingsPayload` widened `target_field`
  to `string | null`.
- `MappingSuggestion` gained optional `required`, `type` and `group*` members,
  which the catalogue fallback reads.

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

[1.0.2]: https://github.com/UmutCanGungormus/vue-import-export/releases/tag/v1.0.2
[0.1.0]: https://github.com/UmutCanGungormus/vue-import-export/releases/tag/v0.1.0
